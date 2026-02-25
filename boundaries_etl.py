#!/usr/bin/env python3
"""
boundaries_etl.py — Download City Limits, ETJ, and ETJ Released polygons

Downloads boundary data from Travis County ArcGIS REST API:
- Layer 0: City Limits (municipal boundaries)
- Layer 1: ETJ Boundaries (extraterritorial jurisdiction)
- Layer 2: ETJ Released (tracts released from ETJ)

Usage:
    python3 boundaries_etl.py               # Download all 3 layers
    python3 boundaries_etl.py --city-limits  # Layer 0 only
    python3 boundaries_etl.py --etj          # Layer 1 only
    python3 boundaries_etl.py --etj-released # Layer 2 only
    python3 boundaries_etl.py --force        # Re-download even if synced
    python3 boundaries_etl.py --status       # Show sync status
"""

import argparse
import json
import time
from gis_etl_utils import (
    configure_stdout, get_connection, ensure_sync_log_table,
    fetch_all_features, register_layer, is_layer_synced,
    update_sync_status, arcgis_to_geojson
)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

BASE_URL = 'https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/Municipal_Jurisdictions_Annexations/MapServer'

LAYERS = {
    'city_limits': {
        'layer_num': 0,
        'url': f'{BASE_URL}/0',
        'unified_group': 'city_limits',
        'server_name': 'Travis County',
        'layer_name': 'Municipal City Limits',
        'name_field': 'NAME',  # Per discovery
    },
    'etj': {
        'layer_num': 1,
        'url': f'{BASE_URL}/1',
        'unified_group': 'etj_boundaries',
        'server_name': 'Travis County',
        'layer_name': 'ETJ Boundaries',
        'name_field': 'NAME',  # Per discovery
    },
    'etj_released': {
        'layer_num': 2,
        'url': f'{BASE_URL}/2',
        'unified_group': 'etj_released',
        'server_name': 'Travis County',
        'layer_name': 'ETJ Released Tracts',
        'name_field': 'Mncpality',  # Per discovery - different schema!
    },
}


def show_status(conn):
    """Show boundary sync status."""
    print("\n  Boundaries Sync Status:")

    for key, cfg in LAYERS.items():
        print(f"\n  {cfg['layer_name']}:")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT sync_status, record_count, last_synced, error_message
                FROM gis_layers_registry
                WHERE endpoint_url = %s
            """, (cfg['url'],))
            row = cur.fetchone()
            if row:
                print(f"    Status: {row[0]}")
                print(f"    Records: {row[1] or 'N/A'}")
                print(f"    Last synced: {row[2] or 'Never'}")
                if row[3]:
                    print(f"    Error: {row[3][:100]}")
            else:
                print("    Not registered yet")

            cur.execute("""
                SELECT COUNT(*) FROM gis_infrastructure WHERE unified_group = %s
            """, (cfg['unified_group'],))
            count = cur.fetchone()[0]
            print(f"    Features in DB: {count:,}")


def download_layer(conn, layer_key, force=False):
    """Download a single boundary layer."""
    cfg = LAYERS[layer_key]

    print("\n" + "="*60)
    print(f"  {cfg['layer_name'].upper()} ETL")
    print("="*60)

    if not force and is_layer_synced(conn, cfg['url']):
        print(f"  Already synced. Use --force to re-download.")
        return True

    # Register layer
    layer_id = register_layer(
        conn, cfg['unified_group'], cfg['server_name'], cfg['url'],
        cfg['layer_name'], 'Polygon', {'name_field': cfg['name_field']}
    )
    print(f"  Layer ID: {layer_id}")
    update_sync_status(conn, layer_id, 'syncing')

    try:
        print(f"\n  Downloading from: {cfg['url']}")
        start = time.time()

        # No bbox needed - Travis County data
        features, geom_type = fetch_all_features(cfg['url'], bbox=None, out_sr=4326)

        # For ETJ Released, 0 features is acceptable
        if not features:
            if layer_key == 'etj_released':
                print("  No ETJ Released tracts (this is acceptable)")
                update_sync_status(conn, layer_id, 'complete', record_count=0)
                return True
            else:
                raise Exception("No features returned from server")

        print(f"\n  Downloaded {len(features):,} features in {time.time() - start:.1f}s")

        # Sample check
        if features:
            sample = features[0].get('attributes', {})
            name_val = sample.get(cfg['name_field'])
            print(f"  Sample {cfg['name_field']}: {name_val}")
            if sample.get('Juris_Type'):
                print(f"  Sample Juris_Type: {sample.get('Juris_Type')}")

        # Bulk insert
        rows = []
        skipped = 0
        for feat in features:
            attrs = feat.get('attributes', {})
            geojson_str = arcgis_to_geojson(feat.get('geometry'), geom_type)
            if not geojson_str:
                skipped += 1
                continue

            # Extract the city/jurisdiction name
            name_val = attrs.get(cfg['name_field'])
            if not name_val:
                # Try fallback fields
                name_val = attrs.get('NAME') or attrs.get('Mncpality') or attrs.get('LABEL')

            rows.append((
                layer_id,
                cfg['unified_group'],
                cfg['server_name'],
                attrs.get('OBJECTID'),
                geojson_str,
                json.dumps(attrs),
                None,  # diameter
                None,  # material
                name_val,  # zone_code (store city/jurisdiction name here)
                None,  # flood_zone
            ))

        # Insert
        with conn.cursor() as cur:
            cur.execute("DELETE FROM gis_infrastructure WHERE layer_id = %s", (layer_id,))
            if cur.rowcount:
                print(f"  Cleared {cur.rowcount} old features")

            chunk_size = 5000
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i + chunk_size]
                cur.executemany("""
                    INSERT INTO gis_infrastructure
                    (layer_id, unified_group, source_server, source_objectid, geom, attributes,
                     diameter, material, zone_code, flood_zone)
                    VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s, %s)
                """, chunk)
                print(f"    {min(i + chunk_size, len(rows))}/{len(rows)}", flush=True)

        conn.commit()

        update_sync_status(conn, layer_id, 'complete', record_count=len(rows))
        elapsed = time.time() - start
        print(f"\n  {cfg['layer_name']} complete: {len(rows):,} inserted, {skipped} skipped in {elapsed:.1f}s")
        return True

    except Exception as e:
        error_msg = str(e)
        print(f"\n  ERROR: {error_msg}")
        update_sync_status(conn, layer_id, 'error', error_msg=error_msg)
        return False


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='Boundaries ETL')
    parser.add_argument('--city-limits', action='store_true', help='City Limits only')
    parser.add_argument('--etj', action='store_true', help='ETJ only')
    parser.add_argument('--etj-released', action='store_true', help='ETJ Released only')
    parser.add_argument('--force', action='store_true', help='Re-download even if synced')
    parser.add_argument('--status', action='store_true', help='Show sync status')
    args = parser.parse_args()

    conn = get_connection()
    ensure_sync_log_table(conn)

    try:
        if args.status:
            show_status(conn)
            return

        # Determine which layers to download
        specific = args.city_limits or args.etj or args.etj_released
        layers_to_download = []

        if args.city_limits or not specific:
            layers_to_download.append('city_limits')
        if args.etj or not specific:
            layers_to_download.append('etj')
        if args.etj_released or not specific:
            layers_to_download.append('etj_released')

        for layer_key in layers_to_download:
            download_layer(conn, layer_key, force=args.force)

        show_status(conn)

    finally:
        conn.close()


if __name__ == '__main__':
    main()
