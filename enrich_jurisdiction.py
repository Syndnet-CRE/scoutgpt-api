#!/usr/bin/env python3
"""
enrich_jurisdiction.py — Enrich properties with city/ETJ jurisdiction data

Point-in-polygon spatial joins against boundary layers:
1. City Limits → city_jurisdiction
2. ETJ Boundaries → in_etj, etj_city
3. ETJ Released → etj_released

Properties not in any city are set to 'UNINCORPORATED'.

Usage:
    python3 enrich_jurisdiction.py            # Enrich properties where city_jurisdiction IS NULL
    python3 enrich_jurisdiction.py --force    # Re-enrich all properties
    python3 enrich_jurisdiction.py --status   # Show enrichment status
"""

import argparse
import time
from gis_etl_utils import configure_stdout, get_connection, get_valid_property_filter

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

BATCH_SIZE = 2000
CITY_LIMITS_GROUP = 'city_limits'
ETJ_GROUP = 'etj_boundaries'
ETJ_RELEASED_GROUP = 'etj_released'


def show_status(conn):
    """Show jurisdiction enrichment status."""
    print("\n  Jurisdiction Enrichment Status:")
    with conn.cursor() as cur:
        # Total properties with valid geom
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
        """)
        total = cur.fetchone()[0]
        print(f"    Total properties (valid geom): {total:,}")

        # With city jurisdiction
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND city_jurisdiction IS NOT NULL
        """)
        with_city = cur.fetchone()[0]
        print(f"    With city jurisdiction: {with_city:,} ({100*with_city/max(total,1):.1f}%)")

        # In ETJ
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND in_etj = TRUE
        """)
        in_etj = cur.fetchone()[0]
        print(f"    In ETJ: {in_etj:,} ({100*in_etj/max(total,1):.1f}%)")

        # ETJ Released
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND etj_released = TRUE
        """)
        etj_released = cur.fetchone()[0]
        print(f"    ETJ Released: {etj_released:,}")

        # Jurisdiction breakdown
        cur.execute("""
            SELECT city_jurisdiction, COUNT(*) as cnt
            FROM properties
            WHERE city_jurisdiction IS NOT NULL
            GROUP BY city_jurisdiction
            ORDER BY cnt DESC
            LIMIT 15
        """)
        rows = cur.fetchall()
        if rows:
            print("\n    Top jurisdictions:")
            for name, cnt in rows:
                print(f"      {name}: {cnt:,}")


def run_enrichment(conn, force=False):
    """Enrich properties with jurisdiction data."""
    print("\n" + "=" * 60)
    print("  JURISDICTION ENRICHMENT")
    print("=" * 60)

    # Check data exists
    with conn.cursor() as cur:
        cur.execute("""
            SELECT unified_group, COUNT(*)
            FROM gis_infrastructure
            WHERE unified_group IN (%s, %s, %s)
            GROUP BY unified_group
        """, (CITY_LIMITS_GROUP, ETJ_GROUP, ETJ_RELEASED_GROUP))
        counts = {row[0]: row[1] for row in cur.fetchall()}

        city_count = counts.get(CITY_LIMITS_GROUP, 0)
        etj_count = counts.get(ETJ_GROUP, 0)
        released_count = counts.get(ETJ_RELEASED_GROUP, 0)

        print(f"  City Limits polygons: {city_count:,}")
        print(f"  ETJ polygons: {etj_count:,}")
        print(f"  ETJ Released polygons: {released_count:,}")

        if city_count == 0:
            print("  WARNING: No City Limits data found.")

    # Build WHERE clause
    where_extra = ""
    if not force:
        where_extra = "AND city_jurisdiction IS NULL"

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

            # Step 1: City Limits lookup
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                )
                UPDATE properties p
                SET city_jurisdiction = COALESCE(subq.city_name, 'UNINCORPORATED')
                FROM (
                    SELECT
                        b.attom_id,
                        g.city_name
                    FROM batch b
                    LEFT JOIN LATERAL (
                        SELECT gi.zone_code as city_name
                        FROM gis_infrastructure gi
                        WHERE gi.unified_group = %s
                        AND ST_Intersects(gi.geom, b.location)
                        LIMIT 1
                    ) g ON TRUE
                ) subq
                WHERE p.attom_id = subq.attom_id
            """, (ids, CITY_LIMITS_GROUP))

            city_updated = cur.rowcount

            # Step 2: ETJ lookup
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                )
                UPDATE properties p
                SET
                    in_etj = TRUE,
                    etj_city = subq.etj_name
                FROM (
                    SELECT
                        b.attom_id,
                        g.zone_code as etj_name
                    FROM batch b
                    INNER JOIN LATERAL (
                        SELECT gi.zone_code
                        FROM gis_infrastructure gi
                        WHERE gi.unified_group = %s
                        AND ST_Intersects(gi.geom, b.location)
                        LIMIT 1
                    ) g ON TRUE
                ) subq
                WHERE p.attom_id = subq.attom_id
            """, (ids, ETJ_GROUP))

            etj_updated = cur.rowcount

            # Step 3: ETJ Released lookup
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                )
                UPDATE properties p
                SET etj_released = TRUE
                FROM (
                    SELECT b.attom_id
                    FROM batch b
                    INNER JOIN LATERAL (
                        SELECT 1
                        FROM gis_infrastructure gi
                        WHERE gi.unified_group = %s
                        AND ST_Intersects(gi.geom, b.location)
                        LIMIT 1
                    ) g ON TRUE
                ) subq
                WHERE p.attom_id = subq.attom_id
            """, (ids, ETJ_RELEASED_GROUP))

            released_updated = cur.rowcount

            enriched_count += city_updated
            processed += len(ids)

            conn.commit()

            elapsed = time.time() - start
            rate = processed / max(elapsed, 0.1)
            batch_time = time.time() - batch_start

            print(f"    {processed:,}/{total:,} ({rate:.0f}/sec) - city:{city_updated} etj:{etj_updated} released:{released_updated} in {batch_time:.1f}s")

            offset += BATCH_SIZE

    elapsed = time.time() - start
    print(f"\n  Jurisdiction enrichment complete: {enriched_count:,} properties enriched in {elapsed:.1f}s")
    return True


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='Jurisdiction Enrichment')
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
