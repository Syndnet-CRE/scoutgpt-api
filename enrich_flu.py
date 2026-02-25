#!/usr/bin/env python3
"""
enrich_flu.py — Enrich properties with Future Land Use designation

Point-in-polygon spatial join against FLUM layer to populate:
- future_land_use: FLU code from FUTURE_LAND_USE field
- flu_jurisdiction: Planning jurisdiction (if available)

Usage:
    python3 enrich_flu.py            # Enrich properties where future_land_use IS NULL
    python3 enrich_flu.py --force    # Re-enrich all properties
    python3 enrich_flu.py --status   # Show enrichment status
"""

import argparse
import time
from gis_etl_utils import (
    configure_stdout, get_connection, get_valid_property_filter,
    FLU_FIELDS
)

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

BATCH_SIZE = 2000
UNIFIED_GROUP = 'future_land_use'


def show_status(conn):
    """Show FLU enrichment status."""
    print("\n  FLU Enrichment Status:")
    with conn.cursor() as cur:
        # Total properties with valid geom
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
        """)
        total = cur.fetchone()[0]
        print(f"    Total properties (valid geom): {total:,}")

        # Enriched
        cur.execute(f"""
            SELECT COUNT(*) FROM properties p
            WHERE {get_valid_property_filter('p')}
            AND future_land_use IS NOT NULL
        """)
        enriched = cur.fetchone()[0]
        print(f"    With FLU: {enriched:,} ({100*enriched/max(total,1):.1f}%)")

        # Remaining
        remaining = total - enriched
        print(f"    Remaining: {remaining:,}")

        # Sample FLU values
        cur.execute("""
            SELECT future_land_use, COUNT(*) as cnt
            FROM properties
            WHERE future_land_use IS NOT NULL
            GROUP BY future_land_use
            ORDER BY cnt DESC
            LIMIT 10
        """)
        rows = cur.fetchall()
        if rows:
            print("\n    Top FLU codes:")
            for code, cnt in rows:
                print(f"      {code}: {cnt:,}")


def run_enrichment(conn, force=False):
    """Enrich properties with FLU data via spatial join."""
    print("\n" + "=" * 60)
    print("  FLU ENRICHMENT")
    print("=" * 60)

    # Check FLUM data exists
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM gis_infrastructure
            WHERE unified_group = %s
        """, (UNIFIED_GROUP,))
        flu_count = cur.fetchone()[0]
        if flu_count == 0:
            print("  ERROR: No FLUM data found. Run flum_etl.py first.")
            return False
        print(f"  FLUM polygons available: {flu_count:,}")

    # Build WHERE clause
    where_extra = ""
    if not force:
        where_extra = "AND future_land_use IS NULL"

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
        # Set statement timeout for long-running queries
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

            # Spatial join: find FLU polygon containing each property point
            cur.execute("""
                WITH batch AS (
                    SELECT attom_id, location
                    FROM properties
                    WHERE attom_id = ANY(%s)
                )
                UPDATE properties p
                SET
                    future_land_use = subq.flu_code,
                    flu_jurisdiction = subq.flu_jurisdiction
                FROM (
                    SELECT DISTINCT ON (b.attom_id)
                        b.attom_id,
                        COALESCE(
                            (g.attributes->>'FUTURE_LAND_USE')::TEXT,
                            g.zone_code
                        ) as flu_code,
                        g.attributes->>'JURISDICTION' as flu_jurisdiction
                    FROM batch b
                    LEFT JOIN LATERAL (
                        SELECT gi.zone_code, gi.attributes
                        FROM gis_infrastructure gi
                        WHERE gi.unified_group = %s
                        AND ST_Intersects(gi.geom, b.location)
                        LIMIT 1
                    ) g ON TRUE
                    WHERE g.zone_code IS NOT NULL
                       OR g.attributes->>'FUTURE_LAND_USE' IS NOT NULL
                ) subq
                WHERE p.attom_id = subq.attom_id
            """, (ids, UNIFIED_GROUP))

            batch_enriched = cur.rowcount
            enriched_count += batch_enriched
            processed += len(ids)

            conn.commit()

            elapsed = time.time() - start
            rate = processed / max(elapsed, 0.1)
            batch_time = time.time() - batch_start

            print(f"    {processed:,}/{total:,} ({rate:.0f}/sec) - batch: {batch_enriched} enriched in {batch_time:.1f}s")

            offset += BATCH_SIZE

    elapsed = time.time() - start
    print(f"\n  FLU enrichment complete: {enriched_count:,} properties enriched in {elapsed:.1f}s")
    return True


def main():
    configure_stdout()

    parser = argparse.ArgumentParser(description='FLU Enrichment')
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
