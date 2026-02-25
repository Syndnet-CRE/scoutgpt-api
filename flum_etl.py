#!/usr/bin/env python3
"""
flum_etl.py — Download Austin Future Land Use Map (FLUM) polygons

Downloads FLUM data from City of Austin ArcGIS REST API and stores
in gis_infrastructure with unified_group = 'future_land_use'.

Usage:
    python3 flum_etl.py            # Download FLUM
    python3 flum_etl.py --force    # Re-download even if synced
    python3 flum_etl.py --status   # Show sync status
"""

import argparse
import time
from gis_etl_utils import (
    configure_stdout, get_connection, ensure_sync_log_table,
    fetch_all_features, register_layer, is_layer_synced,
    update_sync_status, bulk_insert_features, FLU_FIELDS
)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

ENDPOINT_URL = 'https://maps.austintexas.gov/gis/rest/PropertyProfile/LongRangePlanning/MapServer/4'
UNIFIED_GROUP = 'future_land_use'
SERVER_NAME = 'City of Austin'
LAYER_NAME = 'Future Land Use Map (FLUM)'

# The FLU field is FUTURE_LAND_USE (Integer type) per discovery
FLU_FIELD_NAMES = ['FUTURE_LAND_USE', 'FLUM_KEY', 'FLUM_STATUS', 'FLUM_DESC']


def show_status(conn):
    """Show FLUM sync status."""
    print("\n  FLUM Sync Status:")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT sync_status, record_count, last_synced, error_message
            FROM gis_layers_registry
            WHERE endpoint_url = %s
        """, (ENDPOINT_URL,))
        row = cur.fetchone()
        if row:
            print(f"    Status: {row[0]}")
            print(f"    Records: {row[1] or 'N/A'}")
            print(f"    Last synced: {row[2] or 'Never'}")
            if row[3]:
                print(f"    Error: {row[3]}")
        else:
            print("    Not registered yet")

        # Count features
        cur.execute("""
            SELECT COUNT(*) FROM gis_infrastructure WHERE unified_group = %s
        """, (UNIFIED_GROUP,))
        count = cur.fetchone()[0]
        print(f"    Features in DB: {count:,}")


def run_etl(conn, force=False):
    """Download and store FLUM polygons."""
    print("\n" + "="*60)
    print("  FLUM ETL")
    print("="*60)

    # Check if already synced
    if not force and is_layer_synced(conn, ENDPOINT_URL):
        print(f"  Already synced. Use --force to re-download.")
        show_status(conn)
        return

    # Register layer
    print(f"\n  Registering endpoint...")
    layer_id = register_layer(
        conn, UNIFIED_GROUP, SERVER_NAME, ENDPOINT_URL, LAYER_NAME,
        'Polygon', {'flu_field': 'FUTURE_LAND_USE'}
    )
    print(f"  Layer ID: {layer_id}")

    # Update status to syncing
    update_sync_status(conn, layer_id, 'syncing')

    # Download features
    print(f"\n  Downloading from: {ENDPOINT_URL}")
    start = time.time()

    try:
        features, geom_type = fetch_all_features(ENDPOINT_URL, bbox=None, out_sr=4326)

        if not features:
            raise Exception("No features returned from server")

        print(f"\n  Downloaded {len(features):,} features in {time.time() - start:.1f}s")
        print(f"  Geometry type: {geom_type}")

        # Check first feature for FLU field
        if features:
            sample = features[0].get('attributes', {})
            print(f"  Sample attributes: {list(sample.keys())[:10]}...")
            flu_val = sample.get('FUTURE_LAND_USE')
            print(f"  Sample FUTURE_LAND_USE value: {flu_val}")

        # Bulk insert
        inserted, skipped = bulk_insert_features(
            conn, layer_id, UNIFIED_GROUP, SERVER_NAME,
            features, geom_type, zone_field_names=FLU_FIELD_NAMES
        )

        # Update status
        update_sync_status(conn, layer_id, 'complete', record_count=inserted)

        elapsed = time.time() - start
        print(f"\n  ETL complete: {inserted:,} inserted, {skipped} skipped in {elapsed:.1f}s")

    except Exception as e:
        error_msg = str(e)
        print(f"\n  ERROR: {error_msg}")
        update_sync_status(conn, layer_id, 'error', error_msg=error_msg)
        raise


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='FLUM ETL')
    parser.add_argument('--force', action='store_true', help='Re-download even if synced')
    parser.add_argument('--status', action='store_true', help='Show sync status')
    args = parser.parse_args()

    conn = get_connection()
    ensure_sync_log_table(conn)

    try:
        if args.status:
            show_status(conn)
        else:
            run_etl(conn, force=args.force)
            show_status(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
