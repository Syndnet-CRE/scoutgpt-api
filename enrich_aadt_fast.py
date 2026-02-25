#!/usr/bin/env python3
"""
enrich_aadt_fast.py — Fast AADT enrichment using point-centric approach

Instead of finding nearest AADT for each property (slow),
iterate through AADT points and update all properties within radius.

Usage:
    python3 enrich_aadt_fast.py
"""

import time
from gis_etl_utils import configure_stdout, get_connection, get_valid_property_filter

AADT_POINTS_GROUP = 'traffic_aadt'
ROADWAYS_GROUP = 'traffic_roadways'
AADT_RADIUS_METERS = 3000  # 3km radius for AADT points


def run_aadt_enrichment(conn):
    """Enrich properties with AADT values using point-centric approach."""
    print("\n" + "=" * 60)
    print("  AADT ENRICHMENT (Point-Centric)")
    print("=" * 60)

    with conn.cursor() as cur:
        # Get all AADT points with their values
        cur.execute("""
            SELECT
                id,
                attributes->>'_AADT' as aadt_val,
                attributes->>'_ROAD_NAME' as road_name,
                geom
            FROM gis_infrastructure
            WHERE unified_group = %s
            AND attributes->>'_AADT' IS NOT NULL
        """, (AADT_POINTS_GROUP,))
        aadt_points = cur.fetchall()
        print(f"  AADT points with values: {len(aadt_points)}")

        if not aadt_points:
            print("  No AADT points found!")
            return

        # Set longer timeout for these queries
        cur.execute("SET statement_timeout = '600s'")

        start = time.time()
        total_enriched = 0

        for i, (point_id, aadt_val, road_name, geom) in enumerate(aadt_points):
            batch_start = time.time()

            # Find all properties within radius and update
            # Only update if property doesn't have AADT yet, or this point is closer
            cur.execute("""
                UPDATE properties p
                SET
                    nearest_road_aadt = %s::INTEGER,
                    nearest_road_name = COALESCE(p.nearest_road_name, %s),
                    nearest_road_ft = ST_Distance(p.location::geography, %s::geography) * 3.28084
                WHERE """ + get_valid_property_filter('p') + """
                AND ST_DWithin(p.location::geography, %s::geography, %s)
                AND (
                    p.nearest_road_aadt IS NULL
                    OR ST_Distance(p.location::geography, %s::geography) < p.nearest_road_ft / 3.28084
                )
            """, (aadt_val, road_name, geom, geom, AADT_RADIUS_METERS, geom))

            enriched = cur.rowcount
            total_enriched += enriched
            conn.commit()

            elapsed = time.time() - start
            batch_time = time.time() - batch_start

            print(f"    Point {i+1}/{len(aadt_points)}: AADT={aadt_val}, updated {enriched:,} properties in {batch_time:.1f}s")

        elapsed = time.time() - start
        print(f"\n  AADT enrichment complete: {total_enriched:,} total updates in {elapsed:.1f}s")


def run_road_enrichment(conn):
    """Enrich remaining properties with nearest road name/distance."""
    print("\n" + "=" * 60)
    print("  ROAD NAME ENRICHMENT")
    print("=" * 60)

    with conn.cursor() as cur:
        # Count properties still needing road name
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND nearest_road_name IS NULL
        """)
        remaining = cur.fetchone()[0]
        print(f"  Properties needing road name: {remaining:,}")

        if remaining == 0:
            print("  Nothing to do.")
            return

        cur.execute("SET statement_timeout = '300s'")

        # Process in batches
        batch_size = 500
        start = time.time()
        processed = 0
        enriched_count = 0

        while processed < remaining:
            batch_start = time.time()

            cur.execute(f"""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties p
                    WHERE {get_valid_property_filter('p')}
                    AND nearest_road_name IS NULL
                    ORDER BY attom_id
                    LIMIT {batch_size}
                ),
                nearest AS (
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
                FROM nearest n
                WHERE p.attom_id = n.attom_id
                AND n.road_name IS NOT NULL
            """, (ROADWAYS_GROUP,))

            batch_enriched = cur.rowcount
            enriched_count += batch_enriched
            processed += batch_size
            conn.commit()

            elapsed = time.time() - start
            rate = processed / max(elapsed, 0.1)
            batch_time = time.time() - batch_start

            print(f"    {min(processed, remaining):,}/{remaining:,} ({rate:.0f}/sec) - {batch_enriched} enriched in {batch_time:.1f}s")

            if batch_enriched == 0:
                # No more properties to process within roadway distance
                break

        print(f"\n  Road enrichment complete: {enriched_count:,} properties in {time.time() - start:.1f}s")


def show_status(conn):
    """Show enrichment status."""
    print("\n  AADT Enrichment Status:")
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
        """)
        total = cur.fetchone()[0]
        print(f"    Total properties: {total:,}")

        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND nearest_road_aadt IS NOT NULL
        """)
        with_aadt = cur.fetchone()[0]
        print(f"    With AADT: {with_aadt:,} ({100*with_aadt/max(total,1):.1f}%)")

        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND nearest_road_name IS NOT NULL
        """)
        with_road = cur.fetchone()[0]
        print(f"    With road name: {with_road:,} ({100*with_road/max(total,1):.1f}%)")

        # AADT distribution
        cur.execute("""
            SELECT
                CASE
                    WHEN nearest_road_aadt < 5000 THEN '<5k'
                    WHEN nearest_road_aadt < 10000 THEN '5k-10k'
                    WHEN nearest_road_aadt < 25000 THEN '10k-25k'
                    WHEN nearest_road_aadt < 50000 THEN '25k-50k'
                    ELSE '>50k'
                END as aadt_range,
                COUNT(*)
            FROM properties
            WHERE nearest_road_aadt IS NOT NULL
            GROUP BY 1
            ORDER BY MIN(nearest_road_aadt)
        """)
        print("\n    AADT distribution:")
        for range_name, cnt in cur.fetchall():
            print(f"      {range_name}: {cnt:,}")


def main():
    configure_stdout()
    conn = get_connection()

    try:
        # Step 1: AADT points enrichment (fast, point-centric)
        run_aadt_enrichment(conn)

        # Step 2: Road name enrichment for remaining properties
        run_road_enrichment(conn)

        # Show final status
        show_status(conn)

    finally:
        conn.close()


if __name__ == '__main__':
    main()
