#!/usr/bin/env python3
"""
gis_etl_utils.py — Shared utilities for GIS ETL & Enrichment scripts

Provides:
- ArcGIS REST API pagination and geometry conversion
- Database connection and bulk insert helpers
- Batching utilities for property enrichment
- Field extraction from ArcGIS attributes

Usage:
    from gis_etl_utils import (
        get_connection, fetch_all_features, bulk_insert_features,
        get_attom_id_batches, AUSTIN_BBOX_DOWNLOAD
    )
"""

import json
import sys
import time
import psycopg
from psycopg.rows import dict_row
import requests

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

DATABASE_URL = "postgresql://neondb_owner:npg_1IpbVsgTid5k@ep-weathered-cell-aekdgszb-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Austin metro bounding boxes
AUSTIN_BBOX_DOWNLOAD = (-98.2, 29.8, -97.2, 30.8)  # For statewide layer downloads (tighter)
AUSTIN_BBOX_PROPERTY = (-98.3, 29.5, -97.3, 31.0)   # For property validity filter (wider)

# ArcGIS pagination settings
MAX_PER_REQUEST = 2000
REQUEST_TIMEOUT = 120
RATE_LIMIT_DELAY = 0.5
MAX_PAGES = 500
MAX_RETRIES = 3

# Field name candidates for attribute extraction
DIAMETER_FIELDS = [
    'DIAMETER', 'WATERDIAMETER', 'PIPE_DIAMETER', 'PIPESIZE', 'PIPE_SIZE',
    'DIAM', 'SIZE_', 'NOMINALDIAMETER', 'SIZE', 'WATERDIAMETER_INCH',
    'DIAMETER_INCHES', 'PIPESIZE_', 'PIPE_DIA'
]
MATERIAL_FIELDS = ['MATERIAL', 'PIPE_MATERIAL', 'MAT', 'PIPEMATERIAL', 'WATERMATERIAL']
ZONE_FIELDS = [
    'ZONING_ZTYP', 'ZONE_DESCR', 'ZONE_CODE', 'ZONING', 'ZONE_TYPE',
    'ZONING_CODE', 'ZONE', 'ZONINGCODE', 'ZONING_DESIGNATION'
]
FLOOD_FIELDS = ['FLD_ZONE', 'FLOOD_ZONE', 'ZONE', 'SFHA_TF', 'ZONE_SUBTY', 'FLOODZONE', 'FZONE']

# FLU field candidates (Austin FLUM)
FLU_FIELDS = [
    'FLUM_KEY', 'FLUM_STATUS', 'FLUM_DESC', 'FLU_DESIG', 'DESCRIPTION',
    'LAND_USE_DESIGNATION', 'CATEGORY', 'LU_DESC', 'FLUM', 'FLU_CODE',
    'FLUM_CATEGORY', 'FUTURE_LAND_USE'
]

# AADT field candidates
AADT_FIELDS = ['AADT', 'AADT_COMBINED', 'T_AADT', 'AADT_CUR', 'AADT_TOTAL']
ROAD_NAME_FIELDS = ['ROAD_NAME', 'RTE_NM', 'ROAD', 'STREET_NAME', 'RDBD_NM', 'ST_NAME']

# City/jurisdiction field candidates
CITY_FIELDS = ['CITY_NAME', 'JURISDICTION', 'NAME', 'MUNI_NAME', 'MUNICIPALITY', 'ETJ_CITY']

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE CONNECTION
# ═══════════════════════════════════════════════════════════════════════════════

def get_connection(autocommit=False):
    """Get a psycopg3 connection to the Neon database."""
    return psycopg.connect(DATABASE_URL, autocommit=autocommit)


def ensure_sync_log_table(conn):
    """Create gis_sync_log table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS gis_sync_log (
                id SERIAL PRIMARY KEY,
                layer_id INTEGER REFERENCES gis_layers_registry(id),
                started_at TIMESTAMPTZ DEFAULT NOW(),
                completed_at TIMESTAMPTZ,
                status TEXT DEFAULT 'running',
                features_fetched INTEGER,
                features_inserted INTEGER,
                duration_seconds NUMERIC,
                error_message TEXT
            )
        """)
    conn.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# FIELD EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def extract_field(attributes, field_list):
    """Extract first non-empty value from attributes matching field names (case-insensitive)."""
    if not attributes:
        return None
    for field in field_list:
        for key in attributes:
            if key.upper() == field.upper():
                val = attributes[key]
                if val is not None and str(val).strip() != '':
                    return str(val).strip()
    return None


def extract_numeric(attributes, field_list):
    """Extract first numeric value from attributes matching field names."""
    val = extract_field(attributes, field_list)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# ARCGIS REST API
# ═══════════════════════════════════════════════════════════════════════════════

def discover_endpoint(url):
    """
    Query ArcGIS REST endpoint metadata.
    Returns dict with: name, geometryType, fields, count, spatialReference
    """
    try:
        resp = requests.get(f"{url}?f=json", timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if 'error' in data:
            return {'error': data['error'].get('message', 'Unknown error')}

        # Get record count
        count = None
        try:
            count_resp = requests.get(
                f"{url}/query",
                params={'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'},
                timeout=30
            )
            count_data = count_resp.json()
            count = count_data.get('count')
        except:
            pass

        return {
            'name': data.get('name', 'Unknown'),
            'geometryType': data.get('geometryType', 'Unknown'),
            'fields': data.get('fields', []),
            'count': count,
            'spatialReference': data.get('sourceSpatialReference', data.get('extent', {}).get('spatialReference', {})),
        }
    except Exception as e:
        return {'error': str(e)}


def validate_coords(coords):
    """Check all coordinates are valid floats."""
    for c in coords:
        if len(c) < 2:
            return False
        for v in c[:2]:
            if not isinstance(v, (int, float)):
                return False
    return True


def arcgis_to_geojson(geometry, geom_type):
    """
    Convert ArcGIS JSON geometry to GeoJSON string for ST_GeomFromGeoJSON.

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
    return None


def fetch_all_features(url, bbox=None, page_size=2000, out_sr=4326):
    """
    Paginate through ArcGIS REST API results.

    Args:
        url: Base layer URL (e.g., .../MapServer/0 or .../FeatureServer/0)
        bbox: Optional tuple (xmin, ymin, xmax, ymax) for spatial filter
        page_size: Records per page (default 2000)
        out_sr: Output spatial reference (default 4326 = WGS84)

    Returns:
        tuple: (features list, geometryType string)
    """
    all_features = []
    offset = 0
    geom_type = None
    query_url = f"{url}/query"

    # Get total count first
    try:
        resp = requests.get(query_url,
            params={'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'},
            timeout=30)
        count_data = resp.json()
        total_count = count_data.get('count', '?')
        print(f"    Server reports {total_count} total features", flush=True)
    except:
        total_count = '?'

    for page in range(MAX_PAGES):
        params = {
            'where': '1=1',
            'outFields': '*',
            'outSR': str(out_sr),
            'f': 'json',
            'resultOffset': offset,
            'resultRecordCount': page_size
        }

        if bbox:
            params['geometry'] = json.dumps({
                'xmin': bbox[0], 'ymin': bbox[1],
                'xmax': bbox[2], 'ymax': bbox[3],
                'spatialReference': {'wkid': 4326}
            })
            params['geometryType'] = 'esriGeometryEnvelope'
            params['inSR'] = '4326'
            params['spatialRel'] = 'esriSpatialRelIntersects'

        # Retry logic
        data = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(query_url, params=params, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                data = resp.json()
                break
            except requests.exceptions.Timeout:
                if attempt == MAX_RETRIES - 1:
                    print(f"    Timeout at offset {offset} after {MAX_RETRIES} retries", flush=True)
                    return all_features, geom_type
                print(f"    Retry {attempt + 1}/{MAX_RETRIES} (timeout)...", flush=True)
                time.sleep(5 * (attempt + 1))
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    print(f"    Error at offset {offset}: {e}", flush=True)
                    return all_features, geom_type
                print(f"    Retry {attempt + 1}/{MAX_RETRIES}: {e}", flush=True)
                time.sleep(5 * (attempt + 1))

        if data is None:
            break

        if 'error' in data:
            print(f"    ArcGIS error: {data['error'].get('message', '?')}", flush=True)
            break

        features = data.get('features', [])
        if not features:
            break

        if geom_type is None:
            geom_type = data.get('geometryType', 'esriGeometryPolygon')

        all_features.extend(features)

        # Progress
        pct = f" ({len(all_features)}/{total_count})" if total_count != '?' else ""
        print(f"    Page {page + 1}: +{len(features)} = {len(all_features)}{pct}", flush=True)

        # Check if more pages
        if not data.get('exceededTransferLimit', False) and len(features) < page_size:
            break
        offset += page_size
        time.sleep(RATE_LIMIT_DELAY)

    return all_features, geom_type


# ═══════════════════════════════════════════════════════════════════════════════
# ETL HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def register_layer(conn, unified_group, server_name, endpoint_url, layer_name, geometry_type, fields_json=None):
    """
    Register an endpoint in gis_layers_registry. Returns layer_id.
    Uses ON CONFLICT to handle re-registration gracefully.
    """
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO gis_layers_registry
                (unified_group, server_name, endpoint_url, layer_name, geometry_type, fields_json, sync_status)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending')
            ON CONFLICT (endpoint_url) DO UPDATE SET
                unified_group = EXCLUDED.unified_group,
                server_name = EXCLUDED.server_name,
                layer_name = EXCLUDED.layer_name,
                geometry_type = EXCLUDED.geometry_type,
                fields_json = EXCLUDED.fields_json,
                updated_at = NOW()
            RETURNING id
        """, (unified_group, server_name, endpoint_url, layer_name, geometry_type,
              json.dumps(fields_json) if fields_json else None))
        layer_id = cur.fetchone()[0]
    conn.commit()
    return layer_id


def is_layer_synced(conn, endpoint_url):
    """Check if a layer is already synced (sync_status = 'complete')."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT sync_status FROM gis_layers_registry WHERE endpoint_url = %s
        """, (endpoint_url,))
        row = cur.fetchone()
        return row and row[0] == 'complete'


def update_sync_status(conn, layer_id, status, record_count=None, error_msg=None):
    """Update gis_layers_registry sync_status."""
    with conn.cursor() as cur:
        if status == 'complete':
            cur.execute("""
                UPDATE gis_layers_registry
                SET sync_status = %s, record_count = %s, last_synced = NOW(),
                    error_message = NULL, updated_at = NOW()
                WHERE id = %s
            """, (status, record_count, layer_id))
        elif status == 'error':
            cur.execute("""
                UPDATE gis_layers_registry
                SET sync_status = %s, error_message = %s, updated_at = NOW()
                WHERE id = %s
            """, (status, error_msg[:500] if error_msg else None, layer_id))
        else:
            cur.execute("""
                UPDATE gis_layers_registry
                SET sync_status = %s, updated_at = NOW()
                WHERE id = %s
            """, (status, layer_id))
    conn.commit()


def bulk_insert_features(conn, layer_id, unified_group, server_name, features, geom_type,
                         zone_field_names=None):
    """
    Bulk insert features into gis_infrastructure.

    Args:
        conn: Database connection
        layer_id: ID from gis_layers_registry
        unified_group: Category string (e.g., 'future_land_use')
        server_name: Source server name
        features: List of ArcGIS feature dicts
        geom_type: ArcGIS geometry type string
        zone_field_names: Optional list of field names to try for zone_code extraction

    Returns:
        tuple: (inserted count, skipped count)
    """
    zone_fields = zone_field_names or ZONE_FIELDS

    # Prepare rows
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
            unified_group,
            server_name,
            attrs.get('OBJECTID'),
            geojson_str,
            json.dumps(attrs),
            extract_numeric(attrs, DIAMETER_FIELDS),
            extract_field(attrs, MATERIAL_FIELDS),
            extract_field(attrs, zone_fields),
            extract_field(attrs, FLOOD_FIELDS)
        ))

    if not rows:
        return 0, skipped

    print(f"  Inserting {len(rows)} rows...", flush=True)
    start = time.time()

    with conn.cursor() as cur:
        # Delete existing features for this layer
        cur.execute("DELETE FROM gis_infrastructure WHERE layer_id = %s", (layer_id,))
        if cur.rowcount:
            print(f"  Cleared {cur.rowcount} old features", flush=True)

        # Insert in chunks
        chunk_size = 5000
        for i in range(0, len(rows), chunk_size):
            chunk = rows[i:i + chunk_size]
            cur.executemany("""
                INSERT INTO gis_infrastructure
                (layer_id, unified_group, source_server, source_objectid, geom, attributes,
                 diameter, material, zone_code, flood_zone)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s, %s, %s, %s)
            """, chunk)
            elapsed = time.time() - start
            rate = (i + len(chunk)) / max(elapsed, 0.1)
            print(f"    {i + len(chunk)}/{len(rows)} ({rate:.0f} rows/sec)", flush=True)

    conn.commit()
    elapsed = time.time() - start
    print(f"  Inserted {len(rows)} rows in {elapsed:.1f}s", flush=True)
    return len(rows), skipped


# ═══════════════════════════════════════════════════════════════════════════════
# ENRICHMENT HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def get_valid_property_filter(alias='p'):
    """
    SQL WHERE clause fragment to exclude properties with invalid coordinates.
    Uses the wider AUSTIN_BBOX_PROPERTY bounds.
    """
    bbox = AUSTIN_BBOX_PROPERTY
    return f"""
        {alias}.location IS NOT NULL
        AND ST_X({alias}.location) BETWEEN {bbox[0]} AND {bbox[2]}
        AND ST_Y({alias}.location) BETWEEN {bbox[1]} AND {bbox[3]}
    """


def get_attom_id_batches(conn, batch_size=2000, extra_where=''):
    """
    Get batches of attom_ids for enrichment processing.

    Returns:
        tuple: (list of (min_id, max_id, count) tuples, total_count)
    """
    where_clause = get_valid_property_filter('p')
    if extra_where:
        where_clause += f" AND {extra_where}"

    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT attom_id FROM properties p
            WHERE {where_clause}
            ORDER BY attom_id
        """)
        all_ids = [r[0] for r in cur.fetchall()]

    if not all_ids:
        return [], 0

    batches = []
    for i in range(0, len(all_ids), batch_size):
        batch = all_ids[i:i + batch_size]
        batches.append((batch[0], batch[-1], len(batch)))

    print(f"  {len(all_ids):,} properties in {len(batches)} batches of ~{batch_size}", flush=True)
    return batches, len(all_ids)


def add_columns_if_not_exist(conn, columns):
    """
    Add columns to properties table if they don't exist.

    Args:
        conn: Database connection
        columns: List of (column_name, column_type) tuples
    """
    with conn.cursor() as cur:
        for col_name, col_type in columns:
            cur.execute(f"""
                ALTER TABLE properties ADD COLUMN IF NOT EXISTS {col_name} {col_type}
            """)
    conn.commit()
    print(f"  Ensured columns exist: {[c[0] for c in columns]}", flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# STDOUT CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

def configure_stdout():
    """Configure stdout for line-buffered output."""
    sys.stdout.reconfigure(line_buffering=True)
