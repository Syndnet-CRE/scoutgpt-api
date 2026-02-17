#!/usr/bin/env python3
"""
diagnose_and_fix_spatial.py
Run this locally to diagnose and fix the 0-match spatial join issue.

Usage:
    python3 diagnose_and_fix_spatial.py --diagnose    # Run diagnostics only
    python3 diagnose_and_fix_spatial.py --fix         # Apply the fix
    python3 diagnose_and_fix_spatial.py --all         # Diagnose, fix, verify
"""

import sys
import psycopg

CONN = "postgresql://neondb_owner:npg_1IpbVsgTid5k@ep-weathered-cell-aekdgszb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"


def run_query(conn, label, sql, show_rows=True):
    """Run a diagnostic query and print results."""
    print(f"\n{'='*65}")
    print(f"  {label}")
    print(f"{'='*65}")
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            print("  " + " | ".join(f"{c:>20}" for c in cols))
            print("  " + "-" * (23 * len(cols)))
            for row in rows:
                vals = []
                for v in row:
                    if isinstance(v, float):
                        vals.append(f"{v:>20.6f}")
                    else:
                        vals.append(f"{str(v):>20}")
                print("  " + " | ".join(vals))
            if not rows:
                print("  (no rows)")
            return rows
    except Exception as e:
        print(f"  ERROR: {e}")
        conn.rollback()
        return []


def diagnose(conn):
    """Run all diagnostic queries."""
    print("\n" + "#"*65)
    print("  SPATIAL JOIN DIAGNOSTICS")
    print("#"*65)
    
    # 1. Sample coordinates
    props = run_query(conn, "1. PROPERTIES — sample coordinates + SRID", """
        SELECT ST_X(location) AS lng, ST_Y(location) AS lat, ST_SRID(location) AS srid
        FROM properties WHERE location IS NOT NULL LIMIT 3
    """)
    
    zoning = run_query(conn, "2. ZONING — sample centroids + SRID", """
        SELECT ST_X(ST_Centroid(geom)) AS lng, ST_Y(ST_Centroid(geom)) AS lat, 
               ST_SRID(geom) AS srid, source_server, zone_code
        FROM gis_infrastructure WHERE unified_group = 'zoning_districts' 
        AND zone_code IS NOT NULL LIMIT 5
    """)
    
    run_query(conn, "3. FEMA — sample centroids + SRID", """
        SELECT ST_X(ST_Centroid(geometry)) AS lng, ST_Y(ST_Centroid(geometry)) AS lat,
               ST_SRID(geometry) AS srid, zone_type
        FROM fema_flood_zones LIMIT 3
    """)
    
    # 2. Bounding boxes
    run_query(conn, "4. PROPERTIES bounding box", """
        SELECT round(ST_XMin(ext)::numeric,4) AS min_lng, round(ST_YMin(ext)::numeric,4) AS min_lat,
               round(ST_XMax(ext)::numeric,4) AS max_lng, round(ST_YMax(ext)::numeric,4) AS max_lat
        FROM (SELECT ST_Extent(location) AS ext FROM properties WHERE location IS NOT NULL) t
    """)
    
    run_query(conn, "5. ZONING bounding box", """
        SELECT round(ST_XMin(ext)::numeric,4) AS min_lng, round(ST_YMin(ext)::numeric,4) AS min_lat,
               round(ST_XMax(ext)::numeric,4) AS max_lng, round(ST_YMax(ext)::numeric,4) AS max_lat
        FROM (SELECT ST_Extent(geom) AS ext FROM gis_infrastructure WHERE unified_group = 'zoning_districts') t
    """)
    
    # 3. SRID distribution
    run_query(conn, "6. SRID distribution in gis_infrastructure (ALL groups)", """
        SELECT unified_group, ST_SRID(geom) AS srid, COUNT(*) AS cnt
        FROM gis_infrastructure 
        GROUP BY unified_group, ST_SRID(geom)
        ORDER BY unified_group, srid
    """)
    
    # 4. Geometry types
    run_query(conn, "7. Zoning geometry types", """
        SELECT GeometryType(geom) AS gtype, COUNT(*) AS cnt
        FROM gis_infrastructure WHERE unified_group = 'zoning_districts'
        GROUP BY GeometryType(geom)
    """)
    
    # 5. Validity check
    run_query(conn, "8. Invalid zoning geometries", """
        SELECT COUNT(*) AS invalid_count
        FROM gis_infrastructure 
        WHERE unified_group = 'zoning_districts' AND NOT ST_IsValid(geom)
    """)
    
    # 6. Zone code population
    run_query(conn, "9. Zone code stats", """
        SELECT COUNT(*) AS total,
               COUNT(zone_code) AS with_zone_code,
               SUM(CASE WHEN zone_code IS NOT NULL AND zone_code != '' THEN 1 ELSE 0 END) AS non_empty
        FROM gis_infrastructure WHERE unified_group = 'zoning_districts'
    """)
    
    # 7. Direct intersection test
    run_query(conn, "10. Direct ST_Intersects test (limit 10)", """
        SELECT COUNT(*) AS matches FROM (
            SELECT 1 FROM properties p
            JOIN gis_infrastructure gi ON ST_Intersects(gi.geom, p.location)
            WHERE gi.unified_group = 'zoning_districts' AND p.location IS NOT NULL
            LIMIT 10
        ) t
    """)
    
    # 8. Check if location was built with swapped lat/lng
    run_query(conn, "11. Location X/Y vs lat/lng columns (check for swap)", """
        SELECT attom_id, 
               ST_X(location) AS loc_x_should_be_lng, 
               ST_Y(location) AS loc_y_should_be_lat,
               longitude AS col_lng, latitude AS col_lat,
               CASE WHEN abs(ST_X(location) - longitude) < 0.001 THEN 'OK' ELSE 'SWAPPED?' END AS x_check,
               CASE WHEN abs(ST_Y(location) - latitude) < 0.001 THEN 'OK' ELSE 'SWAPPED?' END AS y_check
        FROM properties WHERE location IS NOT NULL AND longitude IS NOT NULL LIMIT 5
    """)
    
    # 9. Try with swapped coordinates (if location was built wrong)
    run_query(conn, "12. Swap test — use raw lat/lng directly", """
        SELECT COUNT(*) AS matches FROM (
            SELECT 1 FROM properties p
            JOIN gis_infrastructure gi ON ST_Intersects(
                gi.geom, 
                ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)
            )
            WHERE gi.unified_group = 'zoning_districts'
            AND p.longitude IS NOT NULL AND p.latitude IS NOT NULL
            LIMIT 10
        ) t
    """)
    
    # 10. Nearest distance (KNN operator)
    run_query(conn, "13. Nearest zoning polygon to first property (distance check)", """
        SELECT p.attom_id,
               round(ST_X(p.location)::numeric,6) AS prop_lng, 
               round(ST_Y(p.location)::numeric,6) AS prop_lat,
               gi.zone_code, gi.source_server,
               round(ST_Distance(gi.geom, p.location)::numeric,6) AS raw_dist,
               round(ST_Distance(gi.geom::geography, p.location::geography)::numeric,1) AS meters
        FROM properties p
        CROSS JOIN LATERAL (
            SELECT zone_code, source_server, geom
            FROM gis_infrastructure 
            WHERE unified_group = 'zoning_districts' AND zone_code IS NOT NULL
            ORDER BY geom <-> p.location LIMIT 1
        ) gi
        WHERE p.location IS NOT NULL
        LIMIT 3
    """)
    
    # 11. Check if SRID=0 (common ETL bug)
    run_query(conn, "14. Records with SRID=0 in gis_infrastructure", """
        SELECT unified_group, COUNT(*) AS srid_zero_count
        FROM gis_infrastructure WHERE ST_SRID(geom) = 0
        GROUP BY unified_group
    """)
    
    # ---- ANALYSIS ----
    print("\n" + "#"*65)
    print("  ANALYSIS")
    print("#"*65)
    
    # Check props coordinates
    if props:
        lng, lat = float(props[0][0]), float(props[0][1])
        if -98.5 < lng < -97.0 and 29.5 < lat < 31.0:
            print("  ✓ Properties coordinates look correct (Austin area)")
        else:
            print(f"  ✗ Properties coordinates look WRONG: lng={lng}, lat={lat}")
            if 29.5 < lng < 31.0 and -98.5 < lat < -97.0:
                print("    → SWAPPED lat/lng! location was built as POINT(lat, lng) instead of POINT(lng, lat)")
    
    if zoning:
        lng, lat = float(zoning[0][0]), float(zoning[0][1])
        if -98.5 < lng < -97.0 and 29.5 < lat < 31.0:
            print("  ✓ Zoning coordinates look correct (Austin area)")
        elif lng > 1000 or lat > 1000:
            print(f"  ✗ Zoning coordinates are in PROJECTED system: x={lng}, y={lat}")
            print("    → ArcGIS endpoint ignored outSR=4326 and returned in State Plane")
            print("    → Fix: ST_Transform(geom, 4326) after setting correct source SRID")
        else:
            print(f"  ✗ Zoning coordinates look WRONG: lng={lng}, lat={lat}")


def fix_srid_zero(conn):
    """Fix SRID=0 geometries by setting them to 4326 (if coordinates are geographic)."""
    print("\n" + "#"*65)
    print("  APPLYING FIX: Set SRID=0 geometries to 4326")
    print("#"*65)
    
    with conn.cursor() as cur:
        # Check how many have SRID=0
        cur.execute("""
            SELECT unified_group, COUNT(*) 
            FROM gis_infrastructure WHERE ST_SRID(geom) = 0 
            GROUP BY unified_group
        """)
        rows = cur.fetchall()
        if not rows:
            print("  No SRID=0 geometries found. Checking other issues...")
            return False
        
        for group, count in rows:
            print(f"  Fixing {count} records in {group}...")
        
        cur.execute("""
            UPDATE gis_infrastructure 
            SET geom = ST_SetSRID(geom, 4326)
            WHERE ST_SRID(geom) = 0
        """)
        fixed = cur.rowcount
        conn.commit()
        print(f"  ✓ Fixed SRID on {fixed} records")
        return True


def fix_invalid_geoms(conn):
    """Fix invalid geometries using ST_MakeValid."""
    print("\n" + "#"*65)
    print("  APPLYING FIX: Make invalid geometries valid")
    print("#"*65)
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM gis_infrastructure 
            WHERE unified_group = 'zoning_districts' AND NOT ST_IsValid(geom)
        """)
        invalid = cur.fetchone()[0]
        if invalid == 0:
            print("  No invalid zoning geometries found.")
            return False
        
        print(f"  Fixing {invalid} invalid geometries...")
        cur.execute("""
            UPDATE gis_infrastructure 
            SET geom = ST_MakeValid(geom)
            WHERE unified_group = 'zoning_districts' AND NOT ST_IsValid(geom)
        """)
        fixed = cur.rowcount
        conn.commit()
        print(f"  ✓ Fixed {fixed} geometries")
        return True


def fix_swapped_location(conn):
    """Fix properties.location if lat/lng were swapped during creation."""
    print("\n" + "#"*65)
    print("  CHECKING: Are properties.location coordinates swapped?")
    print("#"*65)
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT attom_id, ST_X(location) AS loc_x, ST_Y(location) AS loc_y,
                   longitude, latitude
            FROM properties WHERE location IS NOT NULL AND longitude IS NOT NULL
            LIMIT 1
        """)
        row = cur.fetchone()
        if not row:
            print("  No properties with location found")
            return False
        
        attom_id, loc_x, loc_y, col_lng, col_lat = row
        print(f"  location X (should be lng): {loc_x}")
        print(f"  location Y (should be lat): {loc_y}")
        print(f"  longitude column:            {col_lng}")
        print(f"  latitude column:             {col_lat}")
        
        # Check if X matches longitude (correct) or latitude (swapped)
        if col_lng and col_lat:
            x_matches_lng = abs(float(loc_x) - float(col_lng)) < 0.001
            y_matches_lat = abs(float(loc_y) - float(col_lat)) < 0.001
            
            if x_matches_lng and y_matches_lat:
                print("  ✓ Location coordinates match columns — NOT swapped")
                return False
            
            x_matches_lat = abs(float(loc_x) - float(col_lat)) < 0.001
            y_matches_lng = abs(float(loc_y) - float(col_lng)) < 0.001
            
            if x_matches_lat and y_matches_lng:
                print("  ✗ SWAPPED! location = POINT(lat, lng) instead of POINT(lng, lat)")
                print("  Rebuilding location from longitude/latitude columns...")
                cur.execute("""
                    UPDATE properties 
                    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
                    WHERE longitude IS NOT NULL AND latitude IS NOT NULL
                """)
                fixed = cur.rowcount
                conn.commit()
                print(f"  ✓ Rebuilt location for {fixed} properties")
                return True
        
        return False


def verify_fix(conn):
    """Verify spatial joins work after fix."""
    print("\n" + "#"*65)
    print("  VERIFICATION — Testing spatial joins")
    print("#"*65)
    
    run_query(conn, "Zoning intersection test", """
        SELECT COUNT(*) AS matches FROM (
            SELECT 1 FROM properties p
            JOIN gis_infrastructure gi ON ST_Intersects(gi.geom, p.location)
            WHERE gi.unified_group = 'zoning_districts' AND p.location IS NOT NULL
            LIMIT 100
        ) t
    """)
    
    run_query(conn, "FEMA flood zone intersection test", """
        SELECT COUNT(*) AS matches FROM (
            SELECT 1 FROM properties p
            JOIN fema_flood_zones f ON ST_Intersects(f.geometry, p.location)
            WHERE p.location IS NOT NULL
            LIMIT 100
        ) t
    """)
    
    run_query(conn, "Nearest water line test", """
        SELECT p.attom_id,
               round((ST_Distance(gi.geom::geography, p.location::geography) * 3.28084)::numeric, 1) AS dist_ft,
               gi.diameter, gi.material
        FROM properties p
        CROSS JOIN LATERAL (
            SELECT geom, diameter, material
            FROM gis_infrastructure 
            WHERE unified_group = 'water_lines'
            ORDER BY geom <-> p.location LIMIT 1
        ) gi
        WHERE p.location IS NOT NULL
        LIMIT 3
    """)


def main():
    args = sys.argv[1:] if len(sys.argv) > 1 else ["--diagnose"]
    
    with psycopg.connect(CONN) as conn:
        if "--diagnose" in args or "--all" in args:
            diagnose(conn)
        
        if "--fix" in args or "--all" in args:
            # Try each fix in order of likelihood
            fixed = False
            fixed |= fix_srid_zero(conn)
            fixed |= fix_invalid_geoms(conn)
            fixed |= fix_swapped_location(conn)
            
            if not fixed:
                print("\n  ⚠ No automatic fix applied. Manual investigation needed.")
                print("  Check the diagnostic output above — look for:")
                print("  - Projected coordinates (values > 1000)")
                print("  - Bounding boxes that don't overlap")
                print("  - Different SRIDs between tables")
        
        if "--verify" in args or "--all" in args:
            verify_fix(conn)


if __name__ == "__main__":
    main()
