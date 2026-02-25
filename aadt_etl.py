#!/usr/bin/env python3
"""
aadt_etl.py — Download AADT (Annual Average Daily Traffic) data

Downloads from two sources:
1. Travis County AADT point stations (has yearly traffic counts)
2. TxDOT Roadways polylines (road geometry only, no AADT values)

Usage:
    python3 aadt_etl.py            # Download both sources
    python3 aadt_etl.py --points   # Travis County AADT points only
    python3 aadt_etl.py --roads    # TxDOT Roadways only
    python3 aadt_etl.py --force    # Re-download even if synced
    python3 aadt_etl.py --status   # Show sync status
"""

import argparse
import json
import time
from gis_etl_utils import (
    configure_stdout, get_connection, ensure_sync_log_table,
    fetch_all_features, register_layer, is_layer_synced,
    update_sync_status, AUSTIN_BBOX_DOWNLOAD
)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Travis County AADT Points
AADT_POINTS_URL = 'https://gis.traviscountytx.gov/server1/rest/services/Public_Works/TxDOT_24HR_Annual_Avg_Daily_Traffic_AADT/MapServer/0'
AADT_POINTS_GROUP = 'traffic_aadt'
AADT_POINTS_SERVER = 'Travis County / TxDOT'
AADT_POINTS_NAME = 'AADT Traffic Count Stations'

# TxDOT Roadways (statewide, filter to Austin bbox)
ROADWAYS_URL = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0'
ROADWAYS_GROUP = 'traffic_roadways'
ROADWAYS_SERVER = 'TxDOT'
ROADWAYS_NAME = 'TxDOT Roadways'

# Year columns in Travis County AADT (descending priority)
AADT_YEAR_FIELDS = ['F2020', 'F2019', 'F2018', 'F2017', 'F2016', 'F2015']


def extract_aadt_from_years(attrs):
    """Extract AADT value from year columns (most recent first)."""
    for year_field in AADT_YEAR_FIELDS:
        val = attrs.get(year_field)
        if val is not None and val != 0:
            try:
                return int(float(val)), year_field.replace('F', '')
            except (ValueError, TypeError):
                continue
    return None, None


def show_status(conn):
    """Show AADT sync status."""
    print("\n  AADT Sync Status:")

    for url, group, name in [
        (AADT_POINTS_URL, AADT_POINTS_GROUP, 'AADT Points'),
        (ROADWAYS_URL, ROADWAYS_GROUP, 'TxDOT Roadways'),
    ]:
        print(f"\n  {name}:")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT sync_status, record_count, last_synced, error_message
                FROM gis_layers_registry
                WHERE endpoint_url = %s
            """, (url,))
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
            """, (group,))
            count = cur.fetchone()[0]
            print(f"    Features in DB: {count:,}")


def download_aadt_points(conn, force=False):
    """Download Travis County AADT point stations."""
    print("\n" + "="*60)
    print("  AADT POINTS ETL")
    print("="*60)

    if not force and is_layer_synced(conn, AADT_POINTS_URL):
        print(f"  Already synced. Use --force to re-download.")
        return True

    # Register layer
    layer_id = register_layer(
        conn, AADT_POINTS_GROUP, AADT_POINTS_SERVER, AADT_POINTS_URL,
        AADT_POINTS_NAME, 'Point', {'aadt_fields': AADT_YEAR_FIELDS}
    )
    print(f"  Layer ID: {layer_id}")
    update_sync_status(conn, layer_id, 'syncing')

    try:
        print(f"\n  Downloading from: {AADT_POINTS_URL}")
        start = time.time()

        # No bbox needed - already Travis County only
        features, geom_type = fetch_all_features(AADT_POINTS_URL, bbox=None, out_sr=4326)

        if not features:
            raise Exception("No features returned from server")

        print(f"\n  Downloaded {len(features):,} features in {time.time() - start:.1f}s")

        # Process features to extract AADT from year columns
        print("  Extracting AADT values from year columns...")
        for feat in features:
            attrs = feat.get('attributes', {})
            aadt_val, aadt_year = extract_aadt_from_years(attrs)
            if aadt_val:
                attrs['_AADT'] = aadt_val
                attrs['_AADT_YEAR'] = aadt_year
            # Also extract Municipal field as the road name
            if attrs.get('Municipal'):
                attrs['_ROAD_NAME'] = attrs['Municipal']

        # Sample check
        if features:
            sample = features[0].get('attributes', {})
            print(f"  Sample AADT: {sample.get('_AADT')} (year {sample.get('_AADT_YEAR')})")

        # Bulk insert (custom since we need AADT-specific handling)
        from gis_etl_utils import arcgis_to_geojson

        rows = []
        skipped = 0
        for feat in features:
            attrs = feat.get('attributes', {})
            geojson_str = arcgis_to_geojson(feat.get('geometry'), geom_type)
            if not geojson_str:
                skipped += 1
                continue
            rows.append((
                layer_id,
                AADT_POINTS_GROUP,
                AADT_POINTS_SERVER,
                attrs.get('OBJECTID_1') or attrs.get('OBJECTID'),
                geojson_str,
                json.dumps(attrs),
                None,  # diameter
                None,  # material
                str(attrs.get('_AADT', '')) if attrs.get('_AADT') else None,  # zone_code (store AADT here)
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
        print(f"\n  AADT Points complete: {len(rows):,} inserted, {skipped} skipped")
        return True

    except Exception as e:
        error_msg = str(e)
        print(f"\n  ERROR: {error_msg}")
        update_sync_status(conn, layer_id, 'error', error_msg=error_msg)
        return False


def download_roadways(conn, force=False):
    """Download TxDOT Roadways polylines for Austin metro."""
    print("\n" + "="*60)
    print("  TXDOT ROADWAYS ETL")
    print("="*60)

    if not force and is_layer_synced(conn, ROADWAYS_URL):
        print(f"  Already synced. Use --force to re-download.")
        return True

    # Register layer
    layer_id = register_layer(
        conn, ROADWAYS_GROUP, ROADWAYS_SERVER, ROADWAYS_URL,
        ROADWAYS_NAME, 'Polyline', {'road_name_field': 'RTE_NM'}
    )
    print(f"  Layer ID: {layer_id}")
    update_sync_status(conn, layer_id, 'syncing')

    try:
        print(f"\n  Downloading from: {ROADWAYS_URL}")
        print(f"  Bbox filter: {AUSTIN_BBOX_DOWNLOAD}")
        start = time.time()

        features, geom_type = fetch_all_features(ROADWAYS_URL, bbox=AUSTIN_BBOX_DOWNLOAD, out_sr=4326)

        if not features:
            raise Exception("No features returned from server")

        print(f"\n  Downloaded {len(features):,} features in {time.time() - start:.1f}s")

        # Sample check
        if features:
            sample = features[0].get('attributes', {})
            print(f"  Sample RTE_NM: {sample.get('RTE_NM')}")
            print(f"  Sample COUNTY: {sample.get('COUNTY')}")

        # Bulk insert
        from gis_etl_utils import arcgis_to_geojson

        rows = []
        skipped = 0
        for feat in features:
            attrs = feat.get('attributes', {})
            geojson_str = arcgis_to_geojson(feat.get('geometry'), geom_type)
            if not geojson_str:
                skipped += 1
                continue
            rows.append((
                layer_id,
                ROADWAYS_GROUP,
                ROADWAYS_SERVER,
                attrs.get('OBJECTID'),
                geojson_str,
                json.dumps(attrs),
                None,  # diameter
                None,  # material
                attrs.get('RTE_NM'),  # zone_code (store road name here)
                None,  # flood_zone
            ))

        # Insert
        with conn.cursor() as cur:
            cur.execute("DELETE FROM gis_infrastructure WHERE layer_id = %s", (layer_id,))
            if cur.rowcount:
                print(f"  Cleared {cur.rowcount} old features")

            chunk_size = 5000
            insert_start = time.time()
            for i in range(0, len(rows), chunk_size):
                chunk = rows[i:i + chunk_size]
                cur.executemany("""
                    INSERT INTO gis_infrastructure
                    (layer_id, unified_group, source_server, source_objectid, geom, attributes,
                     diameter, material, zone_code, flood_zone)
                    VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s, %s)
                """, chunk)
                elapsed = time.time() - insert_start
                rate = (i + len(chunk)) / max(elapsed, 0.1)
                print(f"    {i + len(chunk)}/{len(rows)} ({rate:.0f} rows/sec)", flush=True)

        conn.commit()

        update_sync_status(conn, layer_id, 'complete', record_count=len(rows))
        elapsed = time.time() - start
        print(f"\n  Roadways complete: {len(rows):,} inserted, {skipped} skipped in {elapsed:.1f}s")
        return True

    except Exception as e:
        error_msg = str(e)
        print(f"\n  ERROR: {error_msg}")
        update_sync_status(conn, layer_id, 'error', error_msg=error_msg)
        return False


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='AADT ETL')
    parser.add_argument('--points', action='store_true', help='AADT points only')
    parser.add_argument('--roads', action='store_true', help='TxDOT roadways only')
    parser.add_argument('--force', action='store_true', help='Re-download even if synced')
    parser.add_argument('--status', action='store_true', help='Show sync status')
    args = parser.parse_args()

    conn = get_connection()
    ensure_sync_log_table(conn)

    try:
        if args.status:
            show_status(conn)
            return

        # Default to both if neither specified
        do_points = args.points or (not args.points and not args.roads)
        do_roads = args.roads or (not args.points and not args.roads)

        if do_points:
            download_aadt_points(conn, force=args.force)

        if do_roads:
            download_roadways(conn, force=args.force)

        show_status(conn)

    finally:
        conn.close()


if __name__ == '__main__':
    main()
