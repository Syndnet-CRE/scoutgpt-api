#!/usr/bin/env python3
"""
enrich_aadt.py — Enrich properties with nearest road and AADT data

Two-step spatial join:
1. First try AADT points (have actual traffic counts)
2. Fall back to TxDOT roadways for road name/distance (no AADT values)

Populates:
- nearest_road_name: Name of nearest road
- nearest_road_aadt: Annual Average Daily Traffic (from AADT points only)
- nearest_road_ft: Distance to nearest road in feet

Usage:
    python3 enrich_aadt.py            # Enrich properties where nearest_road_name IS NULL
    python3 enrich_aadt.py --force    # Re-enrich all properties
    python3 enrich_aadt.py --status   # Show enrichment status
"""

import argparse
import time
from gis_etl_utils import configure_stdout, get_connection, get_valid_property_filter

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

BATCH_SIZE = 500  # Batch size for queries
AADT_POINTS_GROUP = 'traffic_aadt'
ROADWAYS_GROUP = 'traffic_roadways'
# Distance thresholds
AADT_MAX_DISTANCE_METERS = 3000  # 3km for AADT points (they're sparse)
ROAD_MAX_DISTANCE_METERS = 500   # 500m for roadways


def show_status(conn):
    """Show AADT enrichment status."""
    print("\n  AADT Enrichment Status:")
    with conn.cursor() as cur:
        # Total properties with valid geom
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
        """)
        total = cur.fetchone()[0]
        print(f"    Total properties (valid geom): {total:,}")

        # With road name
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND nearest_road_name IS NOT NULL
        """)
        with_road = cur.fetchone()[0]
        print(f"    With nearest road: {with_road:,} ({100*with_road/max(total,1):.1f}%)")

        # With AADT
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND nearest_road_aadt IS NOT NULL
        """)
        with_aadt = cur.fetchone()[0]
        print(f"    With AADT value: {with_aadt:,} ({100*with_aadt/max(total,1):.1f}%)")

        # Distance stats
        cur.execute("""
            SELECT
                AVG(nearest_road_ft)::INTEGER,
                MIN(nearest_road_ft)::INTEGER,
                MAX(nearest_road_ft)::INTEGER
            FROM properties
            WHERE nearest_road_ft IS NOT NULL
        """)
        row = cur.fetchone()
        if row[0]:
            print(f"    Distance (ft): avg={row[0]:,}, min={row[1]:,}, max={row[2]:,}")

        # Sample roads
        cur.execute("""
            SELECT nearest_road_name, COUNT(*) as cnt
            FROM properties
            WHERE nearest_road_name IS NOT NULL
            GROUP BY nearest_road_name
            ORDER BY cnt DESC
            LIMIT 10
        """)
        rows = cur.fetchall()
        if rows:
            print("\n    Top roads:")
            for name, cnt in rows:
                print(f"      {name}: {cnt:,}")


def run_enrichment(conn, force=False):
    """Enrich properties with nearest road data."""
    print("\n" + "=" * 60)
    print("  AADT/ROAD ENRICHMENT")
    print("=" * 60)

    # Check data exists
    with conn.cursor() as cur:
        cur.execute("""
            SELECT unified_group, COUNT(*)
            FROM gis_infrastructure
            WHERE unified_group IN (%s, %s)
            GROUP BY unified_group
        """, (AADT_POINTS_GROUP, ROADWAYS_GROUP))
        counts = {row[0]: row[1] for row in cur.fetchall()}

        aadt_count = counts.get(AADT_POINTS_GROUP, 0)
        road_count = counts.get(ROADWAYS_GROUP, 0)

        print(f"  AADT points available: {aadt_count:,}")
        print(f"  Roadway segments available: {road_count:,}")

        if aadt_count == 0 and road_count == 0:
            print("  ERROR: No AADT or roadway data found. Run aadt_etl.py first.")
            return False

    # Build WHERE clause - process properties missing AADT or road name
    where_extra = ""
    if not force:
        where_extra = "AND (nearest_road_aadt IS NULL OR nearest_road_name IS NULL)"

    # Count properties to process
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')} {where_extra}
        """)
        total = cur.fetchone()[0]
        print(f"  Properties to enrich: {total:,}")

        if total == 0:
            print("  Nothing to do.")
            return True

    # Process in batches
    start = time.time()
    processed = 0
    enriched_count = 0

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '300s'")

        offset = 0
        while offset < total:
            batch_start = time.time()

            # Fetch batch of property IDs
            cur.execute(f"""
                SELECT attom_id
                FROM properties p
                WHERE {get_valid_property_filter('p')} {where_extra}
                ORDER BY attom_id
                LIMIT %s OFFSET %s
            """, (BATCH_SIZE, offset))
            ids = [row[0] for row in cur.fetchall()]

            if not ids:
                break

            # Step 1: Find nearest AADT point (for traffic count)
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                ),
                nearest_aadt AS (
                    SELECT DISTINCT ON (b.attom_id)
                        b.attom_id,
                        (gi.attributes->>'_AADT')::INTEGER as aadt_val,
                        gi.attributes->>'_ROAD_NAME' as road_name,
                        ST_Distance(b.location::geography, gi.geom::geography) * 3.28084 as dist_ft
                    FROM batch b, gis_infrastructure gi
                    WHERE gi.unified_group = %s
                    AND ST_DWithin(b.location::geography, gi.geom::geography, %s)
                    ORDER BY b.attom_id, b.location <-> gi.geom
                )
                UPDATE properties p
                SET
                    nearest_road_aadt = n.aadt_val,
                    nearest_road_name = COALESCE(n.road_name, p.nearest_road_name),
                    nearest_road_ft = COALESCE(n.dist_ft, p.nearest_road_ft)
                FROM nearest_aadt n
                WHERE p.attom_id = n.attom_id
                AND n.aadt_val IS NOT NULL
            """, (ids, AADT_POINTS_GROUP, AADT_MAX_DISTANCE_METERS))

            aadt_enriched = cur.rowcount

            # Step 2: Find nearest roadway (for road name/distance if not set by AADT)
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                    AND nearest_road_name IS NULL
                ),
                nearest_road AS (
                    SELECT DISTINCT ON (b.attom_id)
                        b.attom_id,
                        gi.zone_code as road_name,
                        ST_Distance(b.location::geography, gi.geom::geography) * 3.28084 as dist_ft
                    FROM batch b, gis_infrastructure gi
                    WHERE gi.unified_group = %s
                    AND ST_DWithin(b.location, gi.geom, 0.01)
                    ORDER BY b.attom_id, b.location <-> gi.geom
                )
                UPDATE properties p
                SET
                    nearest_road_name = n.road_name,
                    nearest_road_ft = n.dist_ft
                FROM nearest_road n
                WHERE p.attom_id = n.attom_id
                AND n.road_name IS NOT NULL
                AND n.dist_ft <= %s
            """, (ids, ROADWAYS_GROUP, ROAD_MAX_DISTANCE_METERS * 3.28084))

            road_enriched = cur.rowcount
            batch_enriched = aadt_enriched + road_enriched
            enriched_count += batch_enriched
            processed += len(ids)

            conn.commit()

            elapsed = time.time() - start
            rate = processed / max(elapsed, 0.1)
            batch_time = time.time() - batch_start

            print(f"    {processed:,}/{total:,} ({rate:.0f}/sec) - aadt:{aadt_enriched} road:{road_enriched} in {batch_time:.1f}s")

            offset += BATCH_SIZE

    elapsed = time.time() - start
    print(f"\n  AADT enrichment complete: {enriched_count:,} properties enriched in {elapsed:.1f}s")
    return True


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='AADT/Road Enrichment')
    parser.add_argument('--force', action='store_true', help='Re-enrich all properties')
    parser.add_argument('--status', action='store_true', help='Show enrichment status')
    args = parser.parse_args()

    conn = get_connection()

    try:
        if args.status:
            show_status(conn)
        else:
            run_enrichment(conn, force=args.force)
            show_status(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
