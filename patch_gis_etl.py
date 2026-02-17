#!/usr/bin/env python3
"""
Patch gis_etl.py to fix geometry parse errors.

Changes:
1. Replaces arcgis_to_ewkt() with arcgis_to_geojson() 
   - Handles multipolygons via ring orientation (clockwise=exterior, CCW=hole)
   - Validates all coordinates are numeric (catches corrupted data like "97.6C")
   - Uses json.dumps for safe serialization
2. Changes ST_GeomFromEWKT to ST_SetSRID(ST_GeomFromGeoJSON(), 4326) in INSERT
3. Updates variable names (ewkt -> geojson_str)
4. Adds --retry-errors CLI flag to re-run only failed endpoints

Run: python3 patch_gis_etl.py
(Must be in same directory as gis_etl.py)
"""

import sys
import os

FILENAME = 'gis_etl.py'

if not os.path.exists(FILENAME):
    print(f"ERROR: {FILENAME} not found in current directory.")
    print(f"  Run this from the same folder as {FILENAME}")
    sys.exit(1)

with open(FILENAME, 'r') as f:
    content = f.read()

# Back up original
with open(f'{FILENAME}.bak', 'w') as f:
    f.write(content)
print(f"✓ Backed up original to {FILENAME}.bak")

changes = 0

# ── PATCH 1: Replace geometry functions ──────────────────────────────

OLD_GEOM = '''def coords_to_wkt(coords):
    return ', '.join(f"{c[0]} {c[1]}" for c in coords)


def arcgis_to_ewkt(geometry, geom_type):
    if not geometry:
        return None
    try:
        if geom_type == 'esriGeometryPoint':
            x, y = geometry.get('x'), geometry.get('y')
            if x is None or y is None:
                return None
            return f"SRID=4326;POINT({x} {y})"
        elif geom_type == 'esriGeometryPolyline':
            paths = geometry.get('paths', [])
            if not paths:
                return None
            if len(paths) == 1:
                return f"SRID=4326;LINESTRING({coords_to_wkt(paths[0])})"
            lines = [f"({coords_to_wkt(p)})" for p in paths]
            return f"SRID=4326;MULTILINESTRING({', '.join(lines)})"
        elif geom_type == 'esriGeometryPolygon':
            rings = geometry.get('rings', [])
            if not rings:
                return None
            ring_strs = [f"({coords_to_wkt(r)})" for r in rings]
            return f"SRID=4326;POLYGON({', '.join(ring_strs)})"
    except Exception:
        return None
    return None'''

NEW_GEOM = '''def validate_coords(coords):
    """Check all coordinates are valid floats."""
    for c in coords:
        if len(c) < 2:
            return False
        for v in c[:2]:
            if not isinstance(v, (int, float)):
                return False
    return True


def arcgis_to_geojson(geometry, geom_type):
    """Convert ArcGIS JSON geometry to GeoJSON string for ST_GeomFromGeoJSON.
    
    Handles multipolygons by detecting ring orientation:
    - Clockwise (positive signed area) = exterior ring = starts new polygon
    - Counter-clockwise (negative signed area) = hole in current polygon
    
    Validates all coordinates are numeric to catch corrupted ArcGIS responses.
    """
    if not geometry:
        return None
    try:
        if geom_type == 'esriGeometryPoint':
            x, y = geometry.get('x'), geometry.get('y')
            if x is None or y is None:
                return None
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return None
            return json.dumps({"type": "Point", "coordinates": [x, y]})

        elif geom_type == 'esriGeometryPolyline':
            paths = geometry.get('paths', [])
            if not paths:
                return None
            for p in paths:
                if not validate_coords(p):
                    return None
            clean = [[[c[0], c[1]] for c in p] for p in paths]
            if len(clean) == 1:
                return json.dumps({"type": "LineString", "coordinates": clean[0]})
            return json.dumps({"type": "MultiLineString", "coordinates": clean})

        elif geom_type == 'esriGeometryPolygon':
            rings = geometry.get('rings', [])
            if not rings:
                return None
            for r in rings:
                if not validate_coords(r):
                    return None
            clean = [[[c[0], c[1]] for c in r] for r in rings]
            
            # Group rings into polygons by orientation
            # Clockwise (positive area) = exterior, CCW (negative) = hole
            polygons = []
            current = None
            for ring in clean:
                area = sum(
                    (ring[i+1][0] - ring[i][0]) * (ring[i+1][1] + ring[i][1])
                    for i in range(len(ring) - 1)
                )
                if area >= 0:  # Exterior ring
                    if current is not None:
                        polygons.append(current)
                    current = [ring]
                else:  # Hole
                    if current is not None:
                        current.append(ring)
                    else:
                        current = [ring]
            if current is not None:
                polygons.append(current)

            if len(polygons) == 1:
                return json.dumps({"type": "Polygon", "coordinates": polygons[0]})
            return json.dumps({"type": "MultiPolygon", "coordinates": polygons})

    except (TypeError, ValueError, KeyError):
        return None
    return None'''

if OLD_GEOM in content:
    content = content.replace(OLD_GEOM, NEW_GEOM)
    changes += 1
    print("✓ Patch 1: Replaced geometry functions (EWKT → GeoJSON)")
else:
    print("⚠ Patch 1: Could not find old geometry functions — may already be patched")

# ── PATCH 2: Update INSERT statement ─────────────────────────────────

OLD_INSERT = 'ST_GeomFromEWKT(%s)'
NEW_INSERT = 'ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)'

if OLD_INSERT in content:
    content = content.replace(OLD_INSERT, NEW_INSERT)
    changes += 1
    print("✓ Patch 2: Updated INSERT to use ST_GeomFromGeoJSON")
else:
    print("⚠ Patch 2: ST_GeomFromEWKT not found — may already be patched")

# ── PATCH 3: Update variable names in bulk_insert ────────────────────

OLD_VAR1 = 'ewkt = arcgis_to_ewkt(feat.get(\'geometry\'), geom_type)'
NEW_VAR1 = 'geojson_str = arcgis_to_geojson(feat.get(\'geometry\'), geom_type)'

OLD_VAR2 = 'if not ewkt:'
NEW_VAR2 = 'if not geojson_str:'

OLD_VAR3 = '            ewkt,'
NEW_VAR3 = '            geojson_str,'

for old, new, label in [
    (OLD_VAR1, NEW_VAR1, "converter call"),
    (OLD_VAR2, NEW_VAR2, "null check"),
    (OLD_VAR3, NEW_VAR3, "tuple value"),
]:
    if old in content:
        content = content.replace(old, new)
        changes += 1
        print(f"✓ Patch 3: Updated {label}")
    else:
        print(f"⚠ Patch 3: Could not find {label} — may already be patched")

# ── PATCH 4: Add --retry-errors CLI flag ─────────────────────────────

# Find the argparse section and add the flag
OLD_ARGPARSE_MARKER = "parser.add_argument('--status'"
RETRY_FLAG = """    parser.add_argument('--retry-errors', action='store_true',
                        help='Re-run only endpoints that previously failed')
"""

if '--retry-errors' not in content and OLD_ARGPARSE_MARKER in content:
    content = content.replace(
        OLD_ARGPARSE_MARKER,
        RETRY_FLAG + "    " + OLD_ARGPARSE_MARKER
    )
    changes += 1
    print("✓ Patch 4a: Added --retry-errors argument")
else:
    print("⚠ Patch 4a: --retry-errors already exists or argparse section not found")

# Add the handler in main()
# Look for where --status is handled and add retry-errors handler nearby
RETRY_HANDLER = '''
    if args.retry_errors:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT id, server_name, layer_name, error_message 
                FROM gis_layers_registry WHERE sync_status = 'error'
                ORDER BY id
            """)
            errors = cur.fetchall()
        if not errors:
            print("No failed endpoints to retry.")
            return
        print(f"Retrying {len(errors)} failed endpoints...")
        for layer in errors:
            print(f"  [{layer['id']}] {layer['server_name']} - {layer['layer_name']}")
            print(f"       Previous error: {layer['error_message']}")
            # Clear old data and reset status
            with conn.cursor() as cur:
                cur.execute("DELETE FROM gis_infrastructure WHERE layer_id = %s", (layer['id'],))
                cur.execute("""
                    UPDATE gis_layers_registry 
                    SET sync_status = 'pending', error_message = NULL 
                    WHERE id = %s
                """, (layer['id'],))
            conn.commit()
            sync_layer(conn, layer['id'])
        return
'''

# Insert the retry handler after the status handler
if 'args.retry_errors' not in content and 'if args.status' in content:
    # Find the end of the status block — look for the return after status
    status_block = 'if args.status'
    idx = content.index(status_block)
    # Find the next 'return' after the status block
    return_idx = content.index('return', idx)
    # Find the end of that return line
    newline_idx = content.index('\n', return_idx)
    
    content = content[:newline_idx + 1] + RETRY_HANDLER + content[newline_idx + 1:]
    changes += 1
    print("✓ Patch 4b: Added --retry-errors handler in main()")
else:
    print("⚠ Patch 4b: retry handler already exists or status block not found")

# ── Write patched file ───────────────────────────────────────────────

with open(FILENAME, 'w') as f:
    f.write(content)

print(f"\n{'='*50}")
print(f"Applied {changes} patches to {FILENAME}")
print(f"Original backed up to {FILENAME}.bak")
print(f"\nNext steps:")
print(f"  python3 gis_etl.py --retry-errors")
print(f"{'='*50}")
