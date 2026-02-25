# Design: GIS ETL & Property Enrichment (FLUM, AADT, Boundaries, Infrastructure)

## Date: 2026-02-21
## Brief: docs/briefs/gis-etl-enrichment-brief.md
## Status: APPROVED

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ArcGIS REST API Sources                          │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Austin   │  │ Travis   │  │ TxDOT    │  │ Travis   │  │ ArcGIS   │ │
│  │ FLUM     │  │ County   │  │ Roadways │  │ County   │  │ Online   │ │
│  │MapServer │  │ AADT     │  │FeatureSvr│  │Boundaries│  │ TX Infra │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
└───────┼──────────────┼──────────────┼──────────────┼──────────────┼─────┘
        │              │              │              │              │
        │  Paginate + outSR=4326 + bbox filter       │              │
        v              v              v              v              v
┌─────────────────────────────────────────────────────────────────────────┐
│                         ETL Scripts (Python)                            │
│                                                                         │
│  discover_endpoints.py ─── Schema discovery (field names, SRIDs, counts)│
│  flum_etl.py ──────────── Austin FLUM polygons                         │
│  aadt_etl.py ──────────── AADT points + TxDOT roadway polylines       │
│  boundaries_etl.py ────── City Limits + ETJ + ETJ Released             │
│  tx_infra_etl.py ──────── Texas Infrastructure Map priority layers     │
│                                                                         │
│  All share: gis_etl_utils.py (pagination, geometry, db helpers)        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │  Register + bulk INSERT
                                v
┌─────────────────────────────────────────────────────────────────────────┐
│                        Neon PostgreSQL + PostGIS                        │
│                                                                         │
│  gis_layers_registry ──── Endpoint metadata + sync_status              │
│  gis_infrastructure ───── Feature storage (geom, attributes, groups)   │
│  gis_sync_log ─────────── Audit trail (existing, reused)               │
│  properties ───────────── 418,647 enrichment targets                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │  Spatial joins (batched, 2000/commit)
                                v
┌─────────────────────────────────────────────────────────────────────────┐
│                      Enrichment Scripts (Python)                        │
│                                                                         │
│  enrich_flu.py ────────── ST_Intersects → future_land_use              │
│  enrich_aadt.py ───────── ST_DWithin → nearest_road_aadt (2-step)     │
│  enrich_jurisdiction.py ── ST_Intersects → city/ETJ + UNINCORPORATED  │
│                                                                         │
│  All share: gis_etl_utils.py (batching, connection, bbox filter)       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Execution order:**
1. `discover_endpoints.py` — inspect all sources, print field schemas
2. ETL scripts (can run in parallel): `flum_etl.py`, `aadt_etl.py`, `boundaries_etl.py`, `tx_infra_etl.py`
3. Enrichment scripts (must run sequentially): `enrich_flu.py`, `enrich_aadt.py`, `enrich_jurisdiction.py`

---

### Constraint Analysis

| # | Constraint | Classification | Rationale |
|---|------------|----------------|-----------|
| 1 | psycopg v3 | HARD | Both `gis_etl.py` and `gis_enrichment_v5.py` already use `import psycopg` successfully. ARM64 binary compatibility confirmed. Citation: `gis_etl.py:21`, `gis_enrichment_v5.py:23` |
| 2 | SRID 4326 | HARD | Entire database standardized on 4326. All spatial indexes built on it. Citation: `gisService.js:33` — `ST_MakeEnvelope($2, $3, $4, $5, 4326)` |
| 3 | `outSR=4326` preferred | SOFT | Existing `gis_etl.py:168` uses `'outSR': '4326'` in every request. Server-side reprojection avoids PostGIS `ST_Transform`. Fallback to `ST_Transform(ST_SetSRID(..., 2277), 4326)` if server ignores `outSR`. |
| 4 | Parameterized SQL | HARD | Codebase-wide standard. Citation: `STYLE_GUIDE_DATA.md:119` — "ALL queries use parameterization, NEVER string interpolation." Exception: `gis_enrichment_v5.py:127` uses f-string for `batch_where` — this is acceptable because values are computed internally, never from user input. New scripts will use `%s` parameters with `attom_id BETWEEN %s AND %s`. |
| 5 | Batch 2,000 / commit | HARD | Matches `gis_enrichment_v5.py:53` `BATCH_SIZE = 2000`. Proven safe for Neon connection pooler. |
| 6 | `ST_MakeValid()` | HARD | Known invalid geometries in GIS data. Citation: `gis_enrichment_v5.py:124` — `ST_Intersects(ST_MakeValid(gi.geom), p2.location)`. Required on all polygon-based spatial joins. |
| 7 | `statement_timeout = '120s'` | HARD — **but I recommend 300s**. Existing `gis_enrichment_v5.py:344` uses `SET statement_timeout = '300s'`. With 2000-row batches across 418K properties, some enrichment queries (especially AADT nearest-neighbor) may exceed 120s. Recommend 300s to match existing enrichment pattern. |
| 8 | `flush=True` | SOFT | Existing `gis_enrichment_v5.py:335` uses `sys.stdout.reconfigure(line_buffering=True)` which is cleaner — applies to all prints globally. Follow this pattern. |
| 9 | Austin metro bbox | HARD | Filter: `-98.2, 29.8, -97.2, 30.8`. Existing enrichment uses `-98.3, -97.3, 29.5, 31.0` (`gis_enrichment_v5.py:28-33`). Use the brief's tighter bbox for statewide layer downloads, existing wider bbox for property filtering. |
| 10 | Skip if synced | SOFT | Existing `gis_etl.py:262-267` checks `sync_status` but always re-downloads (deletes old data first). New behavior: check `sync_status = 'complete'` and skip entirely. More efficient for re-runs. |

**Constraint 7 flag:** The brief says 120s but the existing enrichment pipeline uses 300s. Recommend upgrading to 300s. This avoids false timeouts on legitimate queries against 1.5M+ GIS features joined to 418K properties.

---

### Component Design

#### Shared Module: `gis_etl_utils.py`

- **Purpose:** Common utilities shared across all 8 scripts to eliminate code duplication
- **Location:** `/Users/braydonirwin/scoutgpt-api/gis_etl_utils.py`
- **Extends:** Extracts patterns from `gis_etl.py:44-143` (field extraction, geometry conversion, pagination) and `gis_enrichment_v5.py:56-81` (batching, bbox filtering)
- **Interface:**

```python
# Connection
DATABASE_URL: str  # Hardcoded Neon connection string (matches gis_enrichment_v5.py:25)

def get_connection() -> psycopg.Connection
    """Connect with autocommit=False. Caller manages lifecycle."""

# Austin metro bbox constants
AUSTIN_BBOX_DOWNLOAD = (-98.2, 29.8, -97.2, 30.8)  # For statewide layer downloads
AUSTIN_BBOX_PROPERTY = (-98.3, 29.5, -97.3, 31.0)   # For property validity (wider)

# ArcGIS REST API
def discover_endpoint(url: str) -> dict
    """GET {url}?f=json → parsed metadata (fields, geometryType, count, spatialRef)."""

def fetch_all_features(url: str, bbox: tuple|None, page_size: int = 2000, out_sr: int = 4326) -> tuple[list, str]
    """Paginate ArcGIS REST, return (features, geometryType). Handles both MapServer and FeatureServer."""

# Geometry conversion
def arcgis_to_geojson(geometry: dict, geom_type: str) -> str|None
    """Convert ArcGIS JSON geometry to GeoJSON string. Handles points, polylines, polygons, multipolygons."""

# Field extraction
DIAMETER_FIELDS: list[str]
MATERIAL_FIELDS: list[str]
ZONE_FIELDS: list[str]
FLOOD_FIELDS: list[str]

def extract_field(attributes: dict, field_list: list[str]) -> str|None
def extract_numeric(attributes: dict, field_list: list[str]) -> float|None

# ETL helpers
def register_layer(conn, unified_group: str, server_name: str, endpoint_url: str,
                   layer_name: str, geometry_type: str, fields_json: dict) -> int
    """INSERT INTO gis_layers_registry, return layer_id. Skip if endpoint_url already exists."""

def is_layer_synced(conn, endpoint_url: str) -> bool
    """Check if gis_layers_registry has sync_status='complete' for this URL."""

def bulk_insert_features(conn, layer_id: int, unified_group: str, server_name: str,
                         features: list, geom_type: str, zone_field_names: list[str] = None) -> tuple[int, int]
    """Bulk insert into gis_infrastructure. Returns (inserted, skipped). Chunks of 5000."""

def update_sync_status(conn, layer_id: int, status: str, record_count: int = None, error_msg: str = None)
    """Update gis_layers_registry sync_status."""

# Enrichment helpers
def get_valid_property_filter(alias: str = 'p') -> str
    """SQL WHERE clause fragment excluding invalid coordinates."""

def get_attom_id_batches(conn, batch_size: int = 2000, extra_where: str = '') -> tuple[list, int]
    """Return list of (min_id, max_id, count) tuples + total count."""
```

- **Behavior:**
  - `fetch_all_features()` reuses pagination logic from `gis_etl.py:146-205`. Adds optional `bbox` parameter for spatial filtering. Retries 3 times with 5s/10s/15s backoff on network errors.
  - `arcgis_to_geojson()` reuses the validated implementation from `gis_etl.py:75-143`. Handles ring orientation for multipolygons.
  - `register_layer()` uses `ON CONFLICT (endpoint_url) DO UPDATE` to make registration idempotent.
  - `bulk_insert_features()` follows `gis_etl.py:208-258` — prepare rows in memory, `executemany` in 5000-row chunks, commit after each chunk.
  - `get_attom_id_batches()` follows `gis_enrichment_v5.py:65-81` — fetch all valid attom_ids, split into batches of `(min_id, max_id, count)`.

- **Error Cases:**
  - Network timeout → 3 retries with exponential backoff, then raises
  - Invalid geometry → skip feature, increment `skipped` counter
  - `None`/`NaN` coordinates → skip feature
  - ArcGIS error response → log error message, break pagination, return partial results
  - DB connection error → raise immediately (no retry — Neon pooler handles reconnection)

---

#### Script 1: `discover_endpoints.py`

- **Purpose:** Query all target endpoints, print field schemas, record counts, SRIDs. No database writes.
- **Location:** `/Users/braydonirwin/scoutgpt-api/discover_endpoints.py`
- **Extends:** New script, uses `gis_etl_utils.discover_endpoint()`
- **Interface:**

```python
# CLI
python3 discover_endpoints.py           # Discover all endpoints
python3 discover_endpoints.py --flum    # FLUM only
python3 discover_endpoints.py --aadt    # AADT + Roadways only
python3 discover_endpoints.py --boundaries  # City/ETJ only
python3 discover_endpoints.py --infra   # TX Infrastructure only
```

- **Behavior:**
  1. For each endpoint URL: `GET {url}?f=json`
  2. Parse response: `name`, `geometryType`, `fields[]`, `count`, `spatialReference.wkid`
  3. Print formatted table of fields with names, types, aliases
  4. For TX Infrastructure Map: first discover the web map's operational layers, then enumerate each FeatureServer
  5. For the Austin FLUM: identify which field contains the FLU designation by inspecting field names and aliases

- **Error Cases:**
  - Endpoint unreachable → print error, continue to next
  - Invalid JSON → print raw response status, continue

---

#### Script 2: `flum_etl.py`

- **Purpose:** Download Austin FLUM polygons into `gis_infrastructure` with `unified_group = 'future_land_use'`
- **Location:** `/Users/braydonirwin/scoutgpt-api/flum_etl.py`
- **Extends:** `gis_etl_utils.py` for pagination, geometry conversion, bulk insert
- **Interface:**

```python
python3 flum_etl.py            # Download FLUM
python3 flum_etl.py --force    # Re-download even if synced
python3 flum_etl.py --status   # Show sync status
```

- **Behavior:**
  1. Check `gis_layers_registry` for `sync_status = 'complete'` on FLUM URL → skip if synced (unless `--force`)
  2. Register endpoint in `gis_layers_registry` (idempotent via `ON CONFLICT`)
  3. `fetch_all_features()` — no bbox needed (FLUM is Austin-only). Use `outSR=4326`.
  4. **Critical:** The City of Austin server uses `/gis/rest/` NOT `/arcgis/rest/`. The pagination URL pattern is `{url}/query?...` which is standard ArcGIS REST regardless of the path prefix.
  5. Extract FLU designation field: inspect first feature's attributes for the correct field name. Check: `FLUM_KEY`, `FLUM_STATUS`, `FLUM_DESC`, `FLU_DESIG`, `DESCRIPTION`, `LAND_USE_DESIGNATION`, `CATEGORY`, `LU_DESC`, `FLUM`. Store the identified field name.
  6. `bulk_insert_features()` — store features with `zone_code` populated from the identified FLU field. Store full attributes in JSONB for fallback.
  7. Update `gis_layers_registry` with `sync_status = 'complete'`, `record_count`, `fields_json`.

- **Error Cases:**
  - Server returns 0 features → raise error, set `sync_status = 'error'`
  - FLU field not identifiable → log warning, still insert with `zone_code = NULL` (enrichment query uses COALESCE across multiple field names)

---

#### Script 3: `aadt_etl.py`

- **Purpose:** Download both AADT data sources into `gis_infrastructure`
- **Location:** `/Users/braydonirwin/scoutgpt-api/aadt_etl.py`
- **Extends:** `gis_etl_utils.py`
- **Interface:**

```python
python3 aadt_etl.py            # Download both sources
python3 aadt_etl.py --points   # Travis County AADT points only
python3 aadt_etl.py --roads    # TxDOT Roadways only
python3 aadt_etl.py --force    # Re-download even if synced
python3 aadt_etl.py --status   # Show sync status
```

- **Behavior:**
  1. **Source A — Travis County AADT points** (`unified_group = 'traffic_aadt'`):
     - Register endpoint → fetch all features with `outSR=4326` (no bbox needed — pre-clipped to Travis County)
     - Store as Point geometry. Extract AADT value into `attributes` JSONB.
     - Expected fields: `AADT`, `AADT_COMBINED`, `T_AADT`, `ROAD_NAME`, `RTE_NM`
  2. **Source B — TxDOT Roadways** (`unified_group = 'traffic_roadways'`):
     - Register endpoint → fetch with bbox `(-98.2, 29.8, -97.2, 30.8)` and `outSR=4326`
     - This is a FeatureServer (vs MapServer) — same query pattern but check `exceededTransferLimit` vs `features.length < page_size`
     - Store as Polyline/MultiLineString geometry. AADT values may or may not be attributes on the roadway layer.
  3. Update sync status for both sources.

- **Error Cases:**
  - Travis County endpoint unreachable → log error, continue to TxDOT Roadways
  - TxDOT Roadways bbox returns excessive features (>100K) → log warning, continue (expected for metro area)

---

#### Script 4: `boundaries_etl.py`

- **Purpose:** Download City Limits, ETJ, ETJ Released polygons from Travis County MapServer
- **Location:** `/Users/braydonirwin/scoutgpt-api/boundaries_etl.py`
- **Extends:** `gis_etl_utils.py`
- **Interface:**

```python
python3 boundaries_etl.py               # Download all 3 layers
python3 boundaries_etl.py --city-limits  # Layer 0 only
python3 boundaries_etl.py --etj          # Layer 1 only
python3 boundaries_etl.py --etj-released # Layer 2 only
python3 boundaries_etl.py --force        # Re-download even if synced
python3 boundaries_etl.py --status       # Show sync status
```

- **Behavior:**
  1. Base URL: `https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/Municipal_Jurisdictions_Annexations/MapServer`
  2. **Layer 0 — City Limits** (`unified_group = 'city_limits'`):
     - Polygon geometry. Extract city name from attributes (check: `CITY_NAME`, `JURISDICTION`, `NAME`, `MUNI_NAME`, `MUNICIPALITY`).
     - Store city name in `zone_code` column for consistency with existing pattern.
  3. **Layer 1 — ETJ Boundaries** (`unified_group = 'etj_boundaries'`):
     - Polygon geometry. Extract ETJ city name from attributes (same field candidates as city limits).
     - Store ETJ city in `zone_code`.
  4. **Layer 2 — ETJ Released** (`unified_group = 'etj_released'`):
     - Polygon geometry. May have fewer features (released tracts are uncommon).
  5. All layers use `outSR=4326`. Source SRID is 2277 — the server handles reprojection.

- **Error Cases:**
  - Layer returns 0 features → set `sync_status = 'error'` (city limits should never be empty)
  - ETJ Released returns 0 features → acceptable (may genuinely be empty), set `sync_status = 'complete'` with `record_count = 0`

---

#### Script 5: `tx_infra_etl.py`

- **Purpose:** Discover and download Texas Infrastructure Map priority layers
- **Location:** `/Users/braydonirwin/scoutgpt-api/tx_infra_etl.py`
- **Extends:** `gis_etl_utils.py`
- **Interface:**

```python
python3 tx_infra_etl.py              # Discover + download priority layers
python3 tx_infra_etl.py --discover   # Discovery only (no download)
python3 tx_infra_etl.py --force      # Re-download even if synced
python3 tx_infra_etl.py --status     # Show sync status
```

- **Behavior:**
  1. **Discovery phase:**
     - `GET https://www.arcgis.com/sharing/rest/content/items/fed99b46668242a59ddb80bac5e8b71a?f=json` → check `type` field
     - If `type = "Web Map"`: `GET .../data?f=json` → parse `operationalLayers[].url` to get individual FeatureServer/MapServer URLs
     - If `type = "Feature Service"`: use the `url` field directly
     - Enumerate layers on each discovered service: `GET {service_url}?f=json` → parse `layers[]`
  2. **Filtering phase:**
     - Priority layer types (case-insensitive keyword match on layer names):
       - `electric_transmission` — keywords: "electric", "transmission", "power"
       - `gas_pipelines` — keywords: "gas", "pipeline", "natural gas"
       - `rail_lines` — keywords: "rail", "railroad", "freight"
       - `telecom` — keywords: "telecom", "fiber", "communication"
     - Skip layers matching: "water", "wastewater", "sewer", "stormwater", "storm" (already have)
     - Skip layers with geometry type `esriGeometryPoint` (infrastructure points less useful than lines/polygons)
  3. **Download phase:**
     - For each matched layer: register → fetch with Austin metro bbox → bulk insert
     - Use appropriate `unified_group` per layer type

- **Error Cases:**
  - Web map item not found → print error, exit
  - Web map contains no operational layers → print warning, exit
  - No layers match priority keywords → print "no matching layers found", exit cleanly
  - Individual layer download fails → log error, continue to next layer

---

#### Script 6: `enrich_flu.py`

- **Purpose:** Enrich `properties.future_land_use` and `properties.flu_jurisdiction` via point-in-polygon join
- **Location:** `/Users/braydonirwin/scoutgpt-api/enrich_flu.py`
- **Extends:** `gis_etl_utils.py` for batching; follows `gis_enrichment_v5.py:96-151` pattern
- **Interface:**

```python
python3 enrich_flu.py           # Run FLU enrichment
python3 enrich_flu.py --status  # Show enrichment counts
python3 enrich_flu.py --dry-run # Show batches without executing
```

- **Behavior:**
  1. Add columns to `properties` if not exists: `future_land_use TEXT`, `flu_jurisdiction TEXT`
  2. Get batches of un-enriched properties: `WHERE future_land_use IS NULL AND location IS NOT NULL AND [bbox filter]`
  3. For each batch (2000 attom_ids):

```sql
UPDATE properties p SET
    future_land_use = sub.flu,
    flu_jurisdiction = 'City of Austin',
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id,
        COALESCE(
            gi.zone_code,
            gi.attributes->>'FLUM_KEY',
            gi.attributes->>'FLUM_STATUS',
            gi.attributes->>'FLUM_DESC',
            gi.attributes->>'FLU_DESIG',
            gi.attributes->>'DESCRIPTION',
            gi.attributes->>'LAND_USE_DESIGNATION',
            gi.attributes->>'CATEGORY',
            gi.attributes->>'LU_DESC',
            gi.attributes->>'FLUM'
        ) AS flu
    FROM properties p2
    JOIN gis_infrastructure gi
        ON ST_DWithin(gi.geom, p2.location, 0.01)
        AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
    WHERE gi.unified_group = 'future_land_use'
        AND p2.attom_id BETWEEN %s AND %s
        AND [valid property filter]
    ORDER BY p2.attom_id
) sub
WHERE p.attom_id = sub.attom_id
    AND sub.flu IS NOT NULL
    AND TRIM(sub.flu) != ''
```

  4. Commit after each batch. Print progress.
  5. `flu_jurisdiction` is hardcoded to `'City of Austin'` because FLUM only covers Austin.

- **Spatial strategy:** `ST_DWithin(gi.geom, p2.location, 0.01)` as pre-filter (uses GIST index) then `ST_Intersects(ST_MakeValid(gi.geom), p2.location)` for precision. This matches `gis_enrichment_v5.py:123-124`.
- **Error Cases:**
  - Property outside FLUM coverage → stays `NULL` (expected for non-Austin properties)
  - Invalid polygon geometry → `ST_MakeValid()` fixes it
  - Statement timeout → batch fails, next batch continues (safe due to `WHERE future_land_use IS NULL`)

---

#### Script 7: `enrich_aadt.py`

- **Purpose:** Enrich `properties.nearest_road_aadt`, `nearest_road_name`, `nearest_road_ft` using two-step nearest-neighbor
- **Location:** `/Users/braydonirwin/scoutgpt-api/enrich_aadt.py`
- **Extends:** `gis_etl_utils.py`; follows `gis_enrichment_v5.py:212-282` nearest-utility pattern
- **Interface:**

```python
python3 enrich_aadt.py           # Run AADT enrichment (both steps)
python3 enrich_aadt.py --points  # Step 1 only (AADT points)
python3 enrich_aadt.py --roads   # Step 2 only (roadway fallback)
python3 enrich_aadt.py --status  # Show enrichment counts
python3 enrich_aadt.py --dry-run
```

- **Behavior:**
  1. Add columns to `properties` if not exists: `nearest_road_name TEXT`, `nearest_road_aadt INTEGER`, `nearest_road_ft NUMERIC`
  2. **Step 1 — AADT Point Stations** (primary):

```sql
UPDATE properties p SET
    nearest_road_aadt = sub.aadt::integer,
    nearest_road_name = sub.road_name,
    nearest_road_ft = sub.dist_ft,
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id,
        COALESCE(
            gi.attributes->>'AADT',
            gi.attributes->>'AADT_COMBINED',
            gi.attributes->>'T_AADT',
            gi.attributes->>'AADT_CUR'
        ) AS aadt,
        COALESCE(
            gi.attributes->>'ROAD_NAME',
            gi.attributes->>'RTE_NM',
            gi.attributes->>'ROAD',
            gi.attributes->>'STREET_NAME'
        ) AS road_name,
        ROUND((ST_Distance(p2.location::geography, gi.geom::geography) * 3.28084)::numeric, 1) AS dist_ft
    FROM properties p2
    JOIN gis_infrastructure gi
        ON ST_DWithin(p2.location::geography, gi.geom::geography, 152.4)  -- 500ft in meters
    WHERE gi.unified_group = 'traffic_aadt'
        AND p2.attom_id BETWEEN %s AND %s
        AND p2.location IS NOT NULL
        AND p2.nearest_road_aadt IS NULL
        AND [valid property filter]
    ORDER BY p2.attom_id, ST_Distance(p2.location::geography, gi.geom::geography)
) sub
WHERE p.attom_id = sub.attom_id
    AND sub.aadt IS NOT NULL
```

  3. **Step 2 — TxDOT Roadway polylines** (fallback, only for properties still NULL):

```sql
UPDATE properties p SET
    nearest_road_name = sub.road_name,
    nearest_road_ft = sub.dist_ft,
    nearest_road_aadt = NULLIF(sub.aadt, '')::integer,  -- may or may not have AADT
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id,
        COALESCE(
            gi.attributes->>'RTE_NM',
            gi.attributes->>'ROAD_NAME',
            gi.attributes->>'RDBD_NM',
            gi.attributes->>'STREET_NAME'
        ) AS road_name,
        COALESCE(
            gi.attributes->>'AADT',
            gi.attributes->>'T_AADT',
            gi.attributes->>'AADT_COMBINED'
        ) AS aadt,
        ROUND((ST_Distance(p2.location::geography, gi.geom::geography) * 3.28084)::numeric, 1) AS dist_ft
    FROM properties p2
    CROSS JOIN LATERAL (
        SELECT geom, attributes
        FROM gis_infrastructure
        WHERE unified_group = 'traffic_roadways'
        ORDER BY geom <-> p2.location
        LIMIT 1
    ) gi
    WHERE p2.attom_id BETWEEN %s AND %s
        AND p2.location IS NOT NULL
        AND p2.nearest_road_ft IS NULL  -- only properties not enriched in Step 1
        AND [valid property filter]
) sub
WHERE p.attom_id = sub.attom_id
```

  4. Step 2 uses `CROSS JOIN LATERAL` with KNN (`<->` operator) for efficient nearest-road lookup, matching the pattern from `gis_enrichment_v5.py:253-259`.

- **Spatial strategy:**
  - Step 1: `ST_DWithin(geography, geography, 152.4)` — 500ft radius, uses spatial index. Good for sparse point data.
  - Step 2: `CROSS JOIN LATERAL ... ORDER BY geom <-> p2.location LIMIT 1` — KNN index scan. Good for dense polyline data where every property has a nearby road.

- **Error Cases:**
  - AADT value not numeric → `NULLIF(sub.aadt, '')::integer` handles empty strings; truly non-numeric values will fail the cast → those rows excluded by `AND sub.aadt IS NOT NULL`
  - No AADT points within 500ft → property stays `NULL` from Step 1, gets nearest road name/distance from Step 2
  - Step 2 finds road with no AADT attribute → `nearest_road_ft` and `nearest_road_name` populated, `nearest_road_aadt` stays `NULL`

---

#### Script 8: `enrich_jurisdiction.py`

- **Purpose:** Enrich `city_jurisdiction`, `in_etj`, `etj_city`, `etj_released` via point-in-polygon joins, then set `'UNINCORPORATED'` for remaining
- **Location:** `/Users/braydonirwin/scoutgpt-api/enrich_jurisdiction.py`
- **Extends:** `gis_etl_utils.py`; follows `gis_enrichment_v5.py:96-151` (zoning enrichment) pattern
- **Interface:**

```python
python3 enrich_jurisdiction.py                  # Run all 4 passes
python3 enrich_jurisdiction.py --city-limits    # Pass 1 only
python3 enrich_jurisdiction.py --etj            # Pass 2 only
python3 enrich_jurisdiction.py --etj-released   # Pass 3 only
python3 enrich_jurisdiction.py --unincorporated # Pass 4 only
python3 enrich_jurisdiction.py --status         # Show enrichment counts
python3 enrich_jurisdiction.py --dry-run
```

- **Behavior:**
  1. Add columns if not exists: `city_jurisdiction TEXT`, `in_etj BOOLEAN`, `etj_city TEXT`, `etj_released BOOLEAN`
  2. **Pass 1 — City Limits** (run first):

```sql
UPDATE properties p SET
    city_jurisdiction = sub.city_name,
    in_etj = FALSE,
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id,
        COALESCE(
            gi.zone_code,
            gi.attributes->>'CITY_NAME',
            gi.attributes->>'JURISDICTION',
            gi.attributes->>'NAME',
            gi.attributes->>'MUNI_NAME',
            gi.attributes->>'MUNICIPALITY'
        ) AS city_name
    FROM properties p2
    JOIN gis_infrastructure gi
        ON ST_DWithin(gi.geom, p2.location, 0.01)
        AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
    WHERE gi.unified_group = 'city_limits'
        AND p2.attom_id BETWEEN %s AND %s
        AND p2.city_jurisdiction IS NULL
        AND [valid property filter]
    ORDER BY p2.attom_id
) sub
WHERE p.attom_id = sub.attom_id
    AND sub.city_name IS NOT NULL
```

  3. **Pass 2 — ETJ** (only for properties NOT in city limits):

```sql
UPDATE properties p SET
    in_etj = TRUE,
    etj_city = sub.etj_city_name,
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id,
        COALESCE(
            gi.zone_code,
            gi.attributes->>'CITY_NAME',
            gi.attributes->>'JURISDICTION',
            gi.attributes->>'NAME',
            gi.attributes->>'ETJ_CITY'
        ) AS etj_city_name
    FROM properties p2
    JOIN gis_infrastructure gi
        ON ST_DWithin(gi.geom, p2.location, 0.01)
        AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
    WHERE gi.unified_group = 'etj_boundaries'
        AND p2.attom_id BETWEEN %s AND %s
        AND p2.city_jurisdiction IS NULL  -- NOT in city limits
        AND [valid property filter]
    ORDER BY p2.attom_id
) sub
WHERE p.attom_id = sub.attom_id
```

  4. **Pass 3 — ETJ Released** (independent — a property can be in city limits AND have been previously released from ETJ):

```sql
UPDATE properties p SET
    etj_released = TRUE,
    gis_enriched_at = NOW()
FROM (
    SELECT DISTINCT ON (p2.attom_id)
        p2.attom_id
    FROM properties p2
    JOIN gis_infrastructure gi
        ON ST_DWithin(gi.geom, p2.location, 0.01)
        AND ST_Intersects(ST_MakeValid(gi.geom), p2.location)
    WHERE gi.unified_group = 'etj_released'
        AND p2.attom_id BETWEEN %s AND %s
        AND p2.etj_released IS NULL
        AND [valid property filter]
    ORDER BY p2.attom_id
) sub
WHERE p.attom_id = sub.attom_id
```

  5. **Pass 4 — UNINCORPORATED** (simple UPDATE, no spatial join):

```sql
UPDATE properties SET
    city_jurisdiction = 'UNINCORPORATED',
    in_etj = FALSE,
    gis_enriched_at = NOW()
WHERE city_jurisdiction IS NULL
    AND in_etj IS NULL
    AND location IS NOT NULL
    AND [valid property filter]
```

  6. **Execution order matters:** Pass 1 → Pass 2 → Pass 3 → Pass 4. This ensures ETJ only applies to properties not already in city limits, and UNINCORPORATED only applies to properties not in any jurisdiction.

- **Error Cases:**
  - City name NULL in boundary polygon → skip that match (AND sub.city_name IS NOT NULL)
  - Property at boundary of two cities → `DISTINCT ON (attom_id)` picks one arbitrarily (this is acceptable for boundary cases)
  - No city limits or ETJ data loaded → all properties get `'UNINCORPORATED'` in Pass 4 (safe but incorrect — user should check ETL ran)

---

### Data Flow

```
Step 1: Schema discovery
  discover_endpoints.py → stdout (field names, SRIDs, counts)
  No database writes. Human reads output to confirm field names.

Step 2: Database schema prep (in each ETL script)
  ALTER TABLE properties ADD COLUMN IF NOT EXISTS ...

Step 3: ETL Downloads (parallelizable)
  ArcGIS REST API → fetch_all_features() → arcgis_to_geojson()
                                         → extract_field() for zone_code
                                         → bulk_insert_features()
                                         → gis_infrastructure table
                                         → gis_layers_registry updated
                                         → gis_sync_log entry created

Step 4: Enrichment (sequential)
  properties.location (GIST indexed)
    → spatial join with gis_infrastructure.geom (GIST indexed)
    → ST_DWithin() pre-filter + ST_Intersects(ST_MakeValid()) precision
    → UPDATE properties SET enrichment_columns
    → COMMIT per 2000-row batch
```

---

### Database Changes

#### New columns on `properties` table

```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS nearest_road_name TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS nearest_road_aadt INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS nearest_road_ft NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS future_land_use TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS flu_jurisdiction TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS city_jurisdiction TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS in_etj BOOLEAN;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS etj_city TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS etj_released BOOLEAN;
```

**No indexes needed on new columns.** These columns are written in bulk (ETL output) and read via the existing `attom_id` primary key lookup. The `gis_infrastructure.geom` GIST index already exists and handles the spatial join performance.

If query patterns later require filtering by `city_jurisdiction` or `future_land_use`, indexes can be added then. Premature indexing on 418K rows of text columns would slow the bulk UPDATE.

#### New rows in `gis_layers_registry`

Up to ~10 new rows depending on TX Infrastructure discovery:
- 1 for Austin FLUM
- 1 for Travis County AADT points
- 1 for TxDOT Roadways
- 3 for Boundaries (City Limits, ETJ, ETJ Released)
- 1-4 for TX Infrastructure priority layers

#### New rows in `gis_infrastructure`

Estimated new feature counts:
- FLUM polygons: ~500-2,000 (Austin planning areas)
- AADT points: ~2,000-5,000 (Travis County stations)
- TxDOT Roadways: ~20,000-50,000 (Austin metro polylines)
- City Limits: ~50-200 (municipal boundaries)
- ETJ Boundaries: ~50-200
- ETJ Released: ~0-50
- TX Infrastructure: ~5,000-20,000 (filtered to Austin metro)

**Total estimated: ~30,000-80,000 new features** added to the existing 1,507,663.

#### New `unified_group` values

```
'future_land_use'       — FLUM polygons
'traffic_aadt'          — AADT point stations
'traffic_roadways'      — TxDOT roadway polylines
'city_limits'           — Municipal boundary polygons
'etj_boundaries'        — ETJ boundary polygons
'etj_released'          — ETJ released tract polygons
'electric_transmission'  — TX Infrastructure electric (if found)
'gas_pipelines'         — TX Infrastructure gas (if found)
'rail_lines'            — TX Infrastructure rail (if found)
'telecom'               — TX Infrastructure telecom (if found)
```

---

### API Changes

**None.** The brief explicitly states "No new API endpoints." The enrichment data is served through existing property detail endpoints which already return all columns from the `properties` table via `normalizeRow()`.

However, `gisService.js:3-9` defines `UNIFIED_GROUPS` for map layer queries. After ETL, new `unified_group` values exist in `gis_infrastructure` but are not yet queryable via the GIS API. This is a **non-goal** per the brief — no new frontend map layers in this phase.

**Future consideration:** To expose FLUM, AADT, or boundaries as map layers, add entries to `UNIFIED_GROUPS` in `gisService.js` and corresponding routes in `routes/gis.js`. This is ~5 lines of code per layer but is out of scope.

---

### ATTOM Integration Points

**None.** This feature enriches existing ATTOM property records with external GIS data. No new ATTOM API calls or field mappings.

The `properties.location` column (populated from ATTOM's latitude/longitude) is the spatial key for all enrichment joins. Citation: Brief states "418,647 with valid coordinates" out of 444,312 total.

---

### Mapbox Layer Changes

**None.** No frontend map layer changes in this phase. The enriched data is queryable through the property detail API but not rendered as separate map layers.

---

### Dependencies

| Package | Version | Justification | Already Installed |
|---------|---------|---------------|-------------------|
| psycopg[binary] | ≥3.1 | PostgreSQL driver, ARM64 compatible | Yes — `gis_etl.py:21` |
| requests | ≥2.28 | HTTP client for ArcGIS REST API | Yes — `gis_etl.py:23` |

**No new dependencies.** Both packages are already used by existing ETL scripts.

---

### Trade-offs & Alternatives

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Shared utility module | `gis_etl_utils.py` with shared functions | Self-contained scripts (copy utilities into each) | 8 scripts with duplicated 200+ lines of utility code is a maintenance risk. One bug fix needs 8 edits. Shared module follows DRY. Existing scripts (`gis_etl.py`) were self-contained because they were the only ETL script. |
| Enrichment batch key | `attom_id BETWEEN %s AND %s` with parameterized bounds | `attom_id = ANY(%s::bigint[])` with explicit ID arrays | BETWEEN is O(1) range scan on the PK index. ANY with 2000 IDs generates a large parameter list that's slower to parse. Matches `gis_enrichment_v5.py:126` pattern. |
| AADT two-step strategy | Points first → roadway fallback | Single query joining both tables | Two separate passes are simpler to debug and profile. The point layer is small (~2-5K) so Step 1 is fast. Step 2 only runs on remaining NULLs. A single combined query would be more complex with UNION or COALESCE across different geometry types. |
| Jurisdiction ordering | City limits → ETJ → Released → UNINCORPORATED | Single query with CASE WHEN priority | Sequential passes are idempotent (each checks for NULL). A single query would be complex and hard to resume if interrupted. Each pass can be run independently. |
| Statement timeout | 300s (matching existing) | 120s (per brief) | Existing `gis_enrichment_v5.py:344` uses 300s and works reliably. AADT nearest-neighbor with `CROSS JOIN LATERAL` across 418K properties and ~50K road segments may exceed 120s per batch. 300s provides safety margin. |
| Unincorporated handling | Set `city_jurisdiction = 'UNINCORPORATED'` | Leave NULL | Brief decision: explicit string value. Enables queries like `WHERE city_jurisdiction = 'UNINCORPORATED'` without IS NULL ambiguity. |
| Skip geometry types for TX Infra | Skip `esriGeometryPoint` | Download all types | Infrastructure points (e.g., substation locations) are less useful for CRE proximity analysis than lines/polygons (transmission corridors, pipeline routes). Reduces download volume. |

---

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| City of Austin FLUM endpoint uses non-standard `/gis/rest/` path | **Confirmed** | HIGH — ETL fails | `fetch_all_features()` constructs `{url}/query` which works regardless of path prefix. The URL in the brief already includes the correct path. |
| ArcGIS REST endpoint returns SRID 2277 despite `outSR=4326` | LOW | HIGH — all geometries stored at wrong coordinates | Verify in `discover_endpoints.py` that returned coordinates are in WGS84 range (-180..180, -90..90). Fallback: `ST_Transform(ST_SetSRID(..., 2277), 4326)` in INSERT. |
| FLUM field name not in expected list | MEDIUM | MEDIUM — `zone_code` stays NULL | COALESCE across 10+ field name candidates in enrichment SQL. `discover_endpoints.py` identifies the actual field name before ETL runs. |
| TxDOT Roadways FeatureServer has rate limits or IP blocks | LOW | HIGH — partial download | 3 retries with exponential backoff. Pagination with `time.sleep(0.5)` between pages. Roadways are a public dataset, unlikely to be restricted. |
| TX Infrastructure web map item structure is unexpected | MEDIUM | LOW — skip entirely | `tx_infra_etl.py --discover` mode lets user inspect structure before downloading. Graceful fallback: skip infra layers, rest of ETL unaffected. |
| Neon connection drops during long enrichment runs | LOW | LOW — batch is lost, resumable | Each batch commits independently. `WHERE column IS NULL` ensures idempotent re-runs. Lost batch is simply re-processed on next run. |
| AADT point stations have sparse coverage | MEDIUM | MEDIUM — many NULLs | Step 2 (roadway fallback) fills `nearest_road_name` and `nearest_road_ft` even without AADT values. Property-level traffic data is valuable even without exact count. |
| City limits polygons overlap (boundary disputes) | LOW | LOW — wrong jurisdiction assigned | `DISTINCT ON (attom_id)` picks one. In practice, municipal boundaries rarely overlap for a single parcel centroid. |
| Enrichment queries timeout at 300s for dense batches | LOW | MEDIUM — batch skipped | Reduce `BATCH_SIZE` from 2000 to 500 if timeouts occur. Smaller batches = less data per query. The `WHERE column IS NULL` pattern makes this trivially adjustable. |
| `gis_sync_log` table does not exist | LOW | LOW — ETL scripts fail on audit INSERT | Check table existence in `gis_etl_utils.py` startup. If missing, create it. The table is used by existing `gis_etl.py:278` so it likely exists. |

---

### Execution Checklist (for planner)

```
Phase 0: Shared module
  └── gis_etl_utils.py

Phase 1: Discovery
  └── discover_endpoints.py → run → record field names

Phase 2: Schema
  └── ALTER TABLE properties ADD COLUMN (in each ETL script's init)

Phase 3: ETL (parallel)
  ├── flum_etl.py
  ├── aadt_etl.py
  ├── boundaries_etl.py
  └── tx_infra_etl.py

Phase 4: Enrichment (sequential)
  ├── enrich_flu.py
  ├── enrich_aadt.py
  └── enrich_jurisdiction.py (4 passes)

Phase 5: Verification
  └── Each script's --status flag → print final counts
```
