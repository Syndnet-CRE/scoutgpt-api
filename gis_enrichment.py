#!/usr/bin/env python3
"""
GIS Enrichment Pipeline v4 — Fast enrichment using properties.location

Batches by actual attom_id values (handles sparse/non-sequential IDs).

Usage:
  python3 gis_enrichment.py --all       # Run all steps
  python3 gis_enrichment.py --step 1    # Run specific step (1-6)
  python3 gis_enrichment.py --status    # Check enrichment progress
"""

import argparse
import time
import psycopg

DATABASE_URL = "postgresql://neondb_owner:npg_1IpbVsgTid5k@ep-weathered-cell-aekdgszb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

BATCH_SIZE = 25000


def get_id_boundaries(conn):
    """Get actual attom_id boundary values for batching."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT attom_id FROM (
                SELECT attom_id, ROW_NUMBER() OVER (ORDER BY attom_id) AS rn
                FROM properties WHERE location IS NOT NULL
            ) t
            WHERE (rn - 1) % {BATCH_SIZE} = 0
            ORDER BY attom_id
        """)
        boundaries = [row[0] for row in cur.fetchall()]
    return boundaries


def run_batched_step(conn, step_num, description, sql_template, boundaries, total):
    """Run an UPDATE in batches using actual ID boundaries."""
    print(f"\n{'='*60}")
    print(f"Step {step_num}: {description}")
    print(f"{'='*60}")
    print(f"  {total:,} properties in {len(boundaries)} batches of ~{BATCH_SIZE:,}")

    start = time.time()
    total_updated = 0

    for i, batch_start_id in enumerate(boundaries):
        # Next boundary or max
        if i + 1 < len(boundaries):
            batch_end_id = boundaries[i + 1]
            batch_where = f"AND p2.attom_id >= {batch_start_id} AND p2.attom_id < {batch_end_id}"
        else:
            batch_where = f"AND p2.attom_id >= {batch_start_id}"

        batch_sql = sql_template.format(batch_where=batch_where)

        with conn.cursor() as cur:
            cur.execute(batch_sql)
            msg = cur.statusmessage
            count = int(msg.split()[-1]) if msg and msg.startswith('UPDATE') else 0
            total_updated += count

        conn.commit()

        elapsed = time.time() - start
        rate = total_updated / max(elapsed, 0.1)
        pct = ((i + 1) / len(boundaries)) * 100
        print(f"    batch {i+1}/{len(boundaries)}: +{count:,} | total: {total_updated:,} | {pct:.0f}% | {elapsed:.0f}s | {rate:.0f}/sec")

    elapsed = time.time() - start
    print(f"  ✓ {total_updated:,} properties enriched — {elapsed:.1f}s")
    return elapsed


def run_step(conn, step_num, description, sql):
    """Execute a simple non-batched step."""
    print(f"\n{'='*60}")
    print(f"Step {step_num}: {description}")
    print(f"{'='*60}")
    start = time.time()
    with conn.cursor() as cur:
        cur.execute(sql)
        rows = cur.statusmessage
    conn.commit()
    elapsed = time.time() - start
    print(f"  ✓ {rows} — {elapsed:.1f}s")
    return elapsed


# ── SQL Templates ──

STEP_1_SQL = """
    ALTER TABLE properties
        ADD COLUMN IF NOT EXISTS zoning_local TEXT,
        ADD COLUMN IF NOT EXISTS zoning_jurisdiction TEXT,
        ADD COLUMN IF NOT EXISTS flood_zone TEXT,
        ADD COLUMN IF NOT EXISTS flood_zone_desc TEXT,
        ADD COLUMN IF NOT EXISTS in_floodplain BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS nearest_water_ft NUMERIC,
        ADD COLUMN IF NOT EXISTS nearest_water_diam NUMERIC,
        ADD COLUMN IF NOT EXISTS nearest_water_material TEXT,
        ADD COLUMN IF NOT EXISTS nearest_sewer_ft NUMERIC,
        ADD COLUMN IF NOT EXISTS nearest_sewer_diam NUMERIC,
        ADD COLUMN IF NOT EXISTS nearest_storm_ft NUMERIC,
        ADD COLUMN IF NOT EXISTS nearest_storm_diam NUMERIC,
        ADD COLUMN IF NOT EXISTS gis_enriched_at TIMESTAMPTZ
"""

STEP_2_SQL = """
    UPDATE properties p SET
        zoning_local = sub.zone_code,
        zoning_jurisdiction = sub.source_server,
        gis_enriched_at = NOW()
    FROM (
        SELECT DISTINCT ON (p2.attom_id)
            p2.attom_id,
            gi.zone_code,
            gi.source_server
        FROM properties p2
        JOIN gis_infrastructure gi 
            ON gi.unified_group = 'zoning_districts'
            AND gi.zone_code IS NOT NULL
            AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
        WHERE p2.location IS NOT NULL
            {batch_where}
        ORDER BY p2.attom_id, gi.source_server
    ) sub
    WHERE p.attom_id = sub.attom_id
"""

STEP_3_SQL = """
    UPDATE properties p SET
        flood_zone = sub.zone_type,
        flood_zone_desc = sub.zone_description,
        in_floodplain = (sub.zone_type IS NOT NULL AND sub.zone_type NOT IN ('X', 'AREA NOT INCLUDED', 'NONE')),
        gis_enriched_at = NOW()
    FROM (
        SELECT DISTINCT ON (p2.attom_id)
            p2.attom_id,
            fz.zone_type,
            fz.zone_description
        FROM properties p2
        JOIN fema_flood_zones fz
            ON ST_Intersects(ST_MakeValid(fz.geometry), p2.location)
        WHERE p2.location IS NOT NULL
            {batch_where}
        ORDER BY p2.attom_id,
            CASE WHEN fz.zone_type IN ('A', 'AE', 'V', 'VE') THEN 0 ELSE 1 END
    ) sub
    WHERE p.attom_id = sub.attom_id
"""

STEP_4_SQL = """
    UPDATE properties p SET
        nearest_water_ft = sub.dist_ft,
        nearest_water_diam = sub.diameter,
        nearest_water_material = sub.material,
        gis_enriched_at = NOW()
    FROM (
        SELECT DISTINCT ON (p2.attom_id)
            p2.attom_id,
            ROUND(ST_Distance(p2.location::geography, gi.geom::geography) * 3.28084) AS dist_ft,
            gi.diameter,
            gi.material
        FROM properties p2
        JOIN gis_infrastructure gi 
            ON gi.unified_group = 'water_lines'
            AND ST_DWithin(p2.location::geography, gi.geom::geography, 500)
        WHERE p2.location IS NOT NULL
            {batch_where}
        ORDER BY p2.attom_id, ST_Distance(p2.location::geography, gi.geom::geography)
    ) sub
    WHERE p.attom_id = sub.attom_id
"""

STEP_5_SQL = """
    UPDATE properties p SET
        nearest_sewer_ft = sub.dist_ft,
        nearest_sewer_diam = sub.diameter,
        gis_enriched_at = NOW()
    FROM (
        SELECT DISTINCT ON (p2.attom_id)
            p2.attom_id,
            ROUND(ST_Distance(p2.location::geography, gi.geom::geography) * 3.28084) AS dist_ft,
            gi.diameter
        FROM properties p2
        JOIN gis_infrastructure gi 
            ON gi.unified_group = 'wastewater_lines'
            AND ST_DWithin(p2.location::geography, gi.geom::geography, 500)
        WHERE p2.location IS NOT NULL
            {batch_where}
        ORDER BY p2.attom_id, ST_Distance(p2.location::geography, gi.geom::geography)
    ) sub
    WHERE p.attom_id = sub.attom_id
"""

STEP_6_SQL = """
    UPDATE properties p SET
        nearest_storm_ft = sub.dist_ft,
        nearest_storm_diam = sub.diameter,
        gis_enriched_at = NOW()
    FROM (
        SELECT DISTINCT ON (p2.attom_id)
            p2.attom_id,
            ROUND(ST_Distance(p2.location::geography, gi.geom::geography) * 3.28084) AS dist_ft,
            gi.diameter
        FROM properties p2
        JOIN gis_infrastructure gi 
            ON gi.unified_group = 'stormwater_lines'
            AND ST_DWithin(p2.location::geography, gi.geom::geography, 500)
        WHERE p2.location IS NOT NULL
            {batch_where}
        ORDER BY p2.attom_id, ST_Distance(p2.location::geography, gi.geom::geography)
    ) sub
    WHERE p.attom_id = sub.attom_id
"""

BATCHED_STEPS = [
    (2, "Zoning enrichment", STEP_2_SQL, "zoning_local"),
    (3, "Flood zone enrichment", STEP_3_SQL, "flood_zone"),
    (4, "Nearest water line", STEP_4_SQL, "nearest_water_ft"),
    (5, "Nearest sewer line", STEP_5_SQL, "nearest_sewer_ft"),
    (6, "Nearest storm drain", STEP_6_SQL, "nearest_storm_ft"),
]


def show_status(conn):
    """Show enrichment coverage."""
    print("\n  Enrichment Status (properties table):")
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM properties")
        total = cur.fetchone()[0]
        print(f"    Total properties: {total:,}")

        if total == 0:
            return

        for col, label in [
            ('zoning_local', 'Local zoning'),
            ('flood_zone', 'Flood zone'),
            ('nearest_water_ft', 'Nearest water'),
            ('nearest_sewer_ft', 'Nearest sewer'),
            ('nearest_storm_ft', 'Nearest storm'),
            ('gis_enriched_at', 'Any enrichment'),
        ]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM properties WHERE {col} IS NOT NULL")
                count = cur.fetchone()[0]
                pct = (count / total * 100) if total > 0 else 0
                print(f"    {label}: {count:,} / {total:,} ({pct:.1f}%)")
            except Exception:
                print(f"    {label}: column not yet added")
                conn.rollback()


def main():
    parser = argparse.ArgumentParser(description='GIS Enrichment Pipeline v4')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all', action='store_true', help='Run all enrichment steps')
    group.add_argument('--step', type=int, choices=[1,2,3,4,5,6], help='Run specific step')
    group.add_argument('--status', action='store_true', help='Show enrichment progress')
    parser.add_argument('--db', type=str, default=DATABASE_URL, help='Database URL')
    args = parser.parse_args()

    conn = psycopg.connect(args.db)
    print("Connected to Neon")

    if args.status:
        show_status(conn)
        conn.close()
        return

    total_time = 0

    if args.all or args.step == 1:
        total_time += run_step(conn, 1, "Add enrichment columns", STEP_1_SQL)

    # Get batch boundaries once
    print("\nComputing batch boundaries...")
    boundaries = get_id_boundaries(conn)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM properties WHERE location IS NOT NULL")
        total = cur.fetchone()[0]
    print(f"  {total:,} properties → {len(boundaries)} batches")

    for step_num, desc, sql_template, col in BATCHED_STEPS:
        if args.all or args.step == step_num:
            total_time += run_batched_step(conn, step_num, desc, sql_template, boundaries, total)

    print(f"\n{'='*60}")
    print(f"Complete — {total_time:.1f}s total")
    print(f"{'='*60}")

    show_status(conn)
    conn.close()


if __name__ == '__main__':
    main()
