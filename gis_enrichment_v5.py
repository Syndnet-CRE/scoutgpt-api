#!/usr/bin/env python3
"""
gis_enrichment_v5.py — Property GIS Enrichment Pipeline
Enriches properties table with zoning, flood, water, sewer, stormwater data.

Fixes from v4:
1. Zone code extraction — falls back to attributes JSONB when zone_code column is NULL
2. Invalid geometries — uses ST_MakeValid() in all spatial joins
3. Bad property coordinates — excludes properties with location outside Austin metro bbox
4. Uses FEMA flood zones table (not ArcGIS flood data) per architecture decision

Usage:
    python3 gis_enrichment_v5.py --all          # Run full enrichment
    python3 gis_enrichment_v5.py --zoning       # Zoning only
    python3 gis_enrichment_v5.py --flood        # Flood only
    python3 gis_enrichment_v5.py --utilities    # Water + sewer + storm
    python3 gis_enrichment_v5.py --status       # Check enrichment progress
    python3 gis_enrichment_v5.py --dry-run      # Show what would run, don't execute
"""

import sys
import time
import psycopg

CONN = "postgresql://neondb_owner:npg_1IpbVsgTid5k@ep-weathered-cell-aekdgszb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Austin metro bounding box — exclude garbage coordinates like (-1, -1)
AUSTIN_BBOX = {
    "min_lng": -98.3,
    "max_lng": -97.3,
    "min_lat": 29.5,
    "max_lat": 31.0,
}

# All known zoning field names across jurisdictions (exact case from gis_infrastructure.attributes)
ZONE_FIELD_NAMES = [
    # City of Austin
    'ZONING_ZTYPE', 'ZONING_BASE',
    # Kyle
    'Z_Code', 'Description',
    # Georgetown
    'ZONE', 'FULLZONE',
    # San Marcos
    'ZONECODE', 'ZONINGDISTRICT',
    # Round Rock
    'BASE_ZONIN', 'NAME',
    # Pflugerville (note: ZOINING_TY is a typo in their data)
    'ZOINING_TY', 'ZONING_DES',
    # Cedar Park
    'ZoningAbbrev', 'ZoningType',
]

BATCH_SIZE = 2000  # properties per batch


def get_valid_property_filter():
    """SQL WHERE clause to exclude garbage coordinates."""
    return f"""
        p.location IS NOT NULL
        AND ST_X(p.location) BETWEEN {AUSTIN_BBOX['min_lng']} AND {AUSTIN_BBOX['max_lng']}
        AND ST_Y(p.location) BETWEEN {AUSTIN_BBOX['min_lat']} AND {AUSTIN_BBOX['max_lat']}
    """


def get_attom_id_batches(conn):
    """Get all valid attom_ids in batches, sorted."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT attom_id FROM properties p
            WHERE {get_valid_property_filter()}
            ORDER BY attom_id
        """)
        all_ids = [r[0] for r in cur.fetchall()]
    
    batches = []
    for i in range(0, len(all_ids), BATCH_SIZE):
        batch = all_ids[i:i + BATCH_SIZE]
        batches.append((batch[0], batch[-1], len(batch)))
    
    print(f"  {len(all_ids)} valid properties in {len(batches)} batches of ~{BATCH_SIZE}")
    return batches, len(all_ids)


def build_zone_code_coalesce():
    """
    Build a COALESCE expression that extracts zoning from:
    1. The extracted zone_code column (populated for ~6% of records)
    2. Various JSONB attribute keys (covers the remaining ~94%)
    """
    parts = ["gi.zone_code"]
    for field in ZONE_FIELD_NAMES:
        parts.append(f"gi.attributes->>'{field}'")
    return f"COALESCE({', '.join(parts)})"


def enrich_zoning(conn, dry_run=False):
    """Zoning enrichment — point-in-polygon join with full JSONB fallback."""
    print("\n" + "=" * 60)
    print("  ZONING ENRICHMENT")
    print("=" * 60)
    
    zone_coalesce = build_zone_code_coalesce()
    
    batches, total = get_attom_id_batches(conn)
    total_updated = 0
    start = time.time()
    
    for i, (min_id, max_id, batch_count) in enumerate(batches):
        batch_start = time.time()
        
        sql = f"""
            UPDATE properties p SET
                zoning_local = sub.resolved_zone,
                zoning_jurisdiction = sub.source_server,
                gis_enriched_at = NOW()
            FROM (
                SELECT DISTINCT ON (p2.attom_id)
                    p2.attom_id,
                    {zone_coalesce} AS resolved_zone,
                    gi.source_server
                FROM properties p2
                JOIN gis_infrastructure gi
                    ON ST_DWithin(gi.geom, p2.location, 0.01)
                    AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
                WHERE gi.unified_group = 'zoning_districts'
                    AND p2.attom_id BETWEEN %s AND %s
                    AND {get_valid_property_filter().replace('p.', 'p2.')}
                    AND ({zone_coalesce}) IS NOT NULL
                    AND TRIM({zone_coalesce}) != ''
                ORDER BY p2.attom_id, gi.source_server
            ) sub
            WHERE p.attom_id = sub.attom_id
        """
        
        if dry_run:
            print(f"  [DRY RUN] Batch {i+1}/{len(batches)}: attom_id {min_id}..{max_id} ({batch_count} props)")
            continue
        
        with conn.cursor() as cur:
            cur.execute(sql, (min_id, max_id))
            updated = cur.rowcount
        conn.commit()
        
        total_updated += updated
        elapsed = time.time() - batch_start
        print(f"  Batch {i+1}/{len(batches)}: +{updated} updated ({elapsed:.1f}s) | "
              f"Running total: {total_updated}/{total}")
    
    elapsed_total = time.time() - start
    print(f"\n  ✓ Zoning complete: {total_updated} properties enriched in {elapsed_total:.0f}s")
    return total_updated


def enrich_flood(conn, dry_run=False):
    """Flood enrichment using FEMA flood zones table (per architecture decision #3)."""
    print("\n" + "=" * 60)
    print("  FLOOD ENRICHMENT (from fema_flood_zones table)")
    print("=" * 60)
    
    batches, total = get_attom_id_batches(conn)
    total_updated = 0
    start = time.time()
    
    for i, (min_id, max_id, batch_count) in enumerate(batches):
        batch_start = time.time()
        
        sql = f"""
            UPDATE properties p SET
                flood_zone = sub.zone_type,
                flood_zone_desc = sub.zone_description,
                in_floodplain = (sub.zone_type IS NOT NULL 
                                 AND sub.zone_type NOT IN ('X', 'AREA NOT INCLUDED')),
                gis_enriched_at = NOW()
            FROM (
                SELECT DISTINCT ON (p2.attom_id)
                    p2.attom_id,
                    f.zone_type,
                    f.zone_description
                FROM properties p2
                JOIN fema_flood_zones f
                    ON ST_DWithin(f.geometry, p2.location, 0.01)
                    AND ST_Intersects(f.geometry, p2.location)
                WHERE p2.attom_id BETWEEN %s AND %s
                    AND {get_valid_property_filter().replace('p.', 'p2.')}
                    AND f.zone_type IS NOT NULL
                ORDER BY p2.attom_id,
                    CASE WHEN f.zone_type IN ('A', 'AE', 'AH', 'AO', 'V', 'VE') 
                         THEN 0 ELSE 1 END
            ) sub
            WHERE p.attom_id = sub.attom_id
        """
        
        if dry_run:
            print(f"  [DRY RUN] Batch {i+1}/{len(batches)}: attom_id {min_id}..{max_id} ({batch_count} props)")
            continue
        
        with conn.cursor() as cur:
            cur.execute(sql, (min_id, max_id))
            updated = cur.rowcount
        conn.commit()
        
        total_updated += updated
        elapsed = time.time() - batch_start
        print(f"  Batch {i+1}/{len(batches)}: +{updated} updated ({elapsed:.1f}s) | "
              f"Running total: {total_updated}/{total}")
    
    elapsed_total = time.time() - start
    print(f"\n  ✓ Flood complete: {total_updated} properties enriched in {elapsed_total:.0f}s")
    return total_updated


def enrich_nearest_utility(conn, unified_group, col_prefix, dry_run=False):
    """
    Nearest-line enrichment for water/sewer/storm.
    Uses CROSS JOIN LATERAL with KNN (<->) for efficient nearest-neighbor.
    """
    label = unified_group.replace('_', ' ').title()
    print(f"\n{'=' * 60}")
    print(f"  NEAREST {label.upper()} ENRICHMENT")
    print(f"{'=' * 60}")
    
    ft_col = f"nearest_{col_prefix}_ft"
    diam_col = f"nearest_{col_prefix}_diam"
    
    # Check if material column exists (only for water)
    has_material = col_prefix == 'water'
    material_set = f", {f'nearest_{col_prefix}_material'} = sub.material" if has_material else ""
    material_select = ", gi.material" if has_material else ""
    
    batches, total = get_attom_id_batches(conn)
    total_updated = 0
    start = time.time()
    
    for i, (min_id, max_id, batch_count) in enumerate(batches):
        batch_start = time.time()
        
        sql = f"""
            UPDATE properties p SET
                {ft_col} = sub.dist_ft,
                {diam_col} = sub.diameter
                {material_set},
                gis_enriched_at = NOW()
            FROM (
                SELECT 
                    p2.attom_id,
                    round((ST_Distance(
                        gi.geom::geography, 
                        p2.location::geography
                    ) * 3.28084)::numeric, 1) AS dist_ft,
                    gi.diameter
                    {material_select}
                FROM properties p2
                CROSS JOIN LATERAL (
                    SELECT geom, diameter{', material' if has_material else ''}
                    FROM gis_infrastructure
                    WHERE unified_group = '{unified_group}'
                    ORDER BY geom <-> p2.location
                    LIMIT 1
                ) gi
                WHERE p2.attom_id BETWEEN %s AND %s
                    AND {get_valid_property_filter().replace('p.', 'p2.')}
            ) sub
            WHERE p.attom_id = sub.attom_id
        """
        
        if dry_run:
            print(f"  [DRY RUN] Batch {i+1}/{len(batches)}: attom_id {min_id}..{max_id} ({batch_count} props)")
            continue
        
        with conn.cursor() as cur:
            cur.execute(sql, (min_id, max_id))
            updated = cur.rowcount
        conn.commit()
        
        total_updated += updated
        elapsed = time.time() - batch_start
        print(f"  Batch {i+1}/{len(batches)}: +{updated} updated ({elapsed:.1f}s) | "
              f"Running total: {total_updated}/{total}")
    
    elapsed_total = time.time() - start
    print(f"\n  ✓ {label} complete: {total_updated} properties enriched in {elapsed_total:.0f}s")
    return total_updated


def show_status(conn):
    """Show enrichment progress."""
    print("\n" + "=" * 60)
    print("  ENRICHMENT STATUS")
    print("=" * 60)
    
    queries = {
        "Total properties": "SELECT COUNT(*) FROM properties",
        "Valid location (Austin bbox)": f"SELECT COUNT(*) FROM properties p WHERE {get_valid_property_filter()}",
        "Zoning enriched": "SELECT COUNT(*) FROM properties WHERE zoning_local IS NOT NULL",
        "Flood enriched": "SELECT COUNT(*) FROM properties WHERE flood_zone IS NOT NULL",
        "In floodplain": "SELECT COUNT(*) FROM properties WHERE in_floodplain = true",
        "Water distance": "SELECT COUNT(*) FROM properties WHERE nearest_water_ft IS NOT NULL",
        "Sewer distance": "SELECT COUNT(*) FROM properties WHERE nearest_sewer_ft IS NOT NULL",
        "Storm distance": "SELECT COUNT(*) FROM properties WHERE nearest_storm_ft IS NOT NULL",
        "Fully enriched": "SELECT COUNT(*) FROM properties WHERE gis_enriched_at IS NOT NULL",
    }
    
    with conn.cursor() as cur:
        for label, sql in queries.items():
            cur.execute(sql)
            count = cur.fetchone()[0]
            print(f"  {label:.<40} {count:>10,}")
    
    # Zoning breakdown
    print(f"\n  Top zoning codes:")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT zoning_local, zoning_jurisdiction, COUNT(*) AS cnt
            FROM properties 
            WHERE zoning_local IS NOT NULL
            GROUP BY zoning_local, zoning_jurisdiction
            ORDER BY cnt DESC LIMIT 15
        """)
        for zone, jurisdiction, cnt in cur.fetchall():
            print(f"    {zone:>10} ({jurisdiction:>15}) — {cnt:,}")
    
    # Flood breakdown
    print(f"\n  Flood zone distribution:")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT flood_zone, COUNT(*) AS cnt
            FROM properties WHERE flood_zone IS NOT NULL
            GROUP BY flood_zone ORDER BY cnt DESC LIMIT 10
        """)
        for zone, cnt in cur.fetchall():
            print(f"    {zone:>10} — {cnt:,}")


def main():
    sys.stdout.reconfigure(line_buffering=True)
    args = set(sys.argv[1:]) if len(sys.argv) > 1 else {"--help"}
    dry_run = "--dry-run" in args

    if "--help" in args or not args:
        print(__doc__)
        return

    with psycopg.connect(CONN) as conn:
        conn.execute("SET statement_timeout = '300s'")
        if "--status" in args:
            show_status(conn)
            return
        
        run_all = "--all" in args
        results = {}
        
        if run_all or "--zoning" in args:
            results["zoning"] = enrich_zoning(conn, dry_run)
        
        if run_all or "--flood" in args:
            results["flood"] = enrich_flood(conn, dry_run)
        
        if run_all or "--utilities" in args or "--water" in args:
            results["water"] = enrich_nearest_utility(conn, "water_lines", "water", dry_run)
        
        if run_all or "--utilities" in args or "--sewer" in args:
            results["sewer"] = enrich_nearest_utility(conn, "wastewater_lines", "sewer", dry_run)
        
        if run_all or "--utilities" in args or "--storm" in args:
            results["storm"] = enrich_nearest_utility(conn, "stormwater_lines", "storm", dry_run)
        
        # Summary
        if results:
            print("\n" + "=" * 60)
            print("  ENRICHMENT SUMMARY")
            print("=" * 60)
            for step, count in results.items():
                status = "DRY RUN" if dry_run else f"{count:,} updated"
                print(f"  {step:.<30} {status}")
            
            if not dry_run:
                show_status(conn)


if __name__ == "__main__":
    main()
