# Brief: GIS ETL & Property Enrichment (FLUM, AADT, Boundaries, Infrastructure)

## Date: 2026-02-20
## Status: DRAFT

---

### Requirements

1. Download Austin Future Land Use Map (FLUM) polygons from City of Austin MapServer into `gis_infrastructure` table
2. Download Travis County AADT point stations from Travis County MapServer into `gis_infrastructure` table
3. Download TxDOT Roadway polylines (Austin metro bbox) from TxDOT FeatureServer into `gis_infrastructure` table
4. Download Travis County City Limits polygons (Layer 0) into `gis_infrastructure` table
5. Download Travis County ETJ boundary polygons (Layer 1) into `gis_infrastructure` table
6. Download Travis County ETJ Released polygons (Layer 2) into `gis_infrastructure` table
7. Discover and download priority Texas Infrastructure Map layers (electric transmission, gas pipelines, rail, telecom) into `gis_infrastructure` table
8. Register all discovered endpoints in `gis_layers_registry` with field schemas
9. Add 9 new columns to `properties` table:
   - `nearest_road_name` TEXT
   - `nearest_road_aadt` INTEGER
   - `nearest_road_ft` NUMERIC
   - `future_land_use` TEXT
   - `flu_jurisdiction` TEXT
   - `city_jurisdiction` TEXT
   - `in_etj` BOOLEAN
   - `etj_city` TEXT
   - `etj_released` BOOLEAN
10. Enrich 418,647 Austin metro properties with `future_land_use` via point-in-polygon spatial join against FLUM polygons
11. Enrich properties with `nearest_road_aadt`, `nearest_road_name`, `nearest_road_ft` using nearest-neighbor join (AADT points as primary source, roadway polylines as fallback)
12. Enrich properties with `city_jurisdiction` via point-in-polygon join against City Limits; set to 'UNINCORPORATED' for properties outside all city limits and ETJ
13. Enrich properties with `in_etj` = TRUE and `etj_city` for properties outside city limits but inside ETJ boundaries
14. Enrich properties with `etj_released` = TRUE for properties inside ETJ Released tracts
15. All scripts must be idempotent: skip already-synced layers (ETL) and already-enriched properties (enrichment)
16. All scripts must use batched commits (2,000 rows) — safe to interrupt and resume

---

### Constraints

| # | Constraint | Type | Rationale |
|---|------------|------|-----------|
| 1 | Use psycopg v3 (NOT psycopg2) | HARD | Mac ARM64 binary compatibility |
| 2 | Store all geometry as SRID 4326 (WGS84) | HARD | Database standard; all existing data uses 4326 |
| 3 | Request `outSR=4326` from ArcGIS APIs | SOFT | Server-side reprojection preferred over PostGIS transform |
| 4 | Parameterize all SQL queries | HARD | Security; no string interpolation ever |
| 5 | Batch commits every 2,000 rows | HARD | Resumability; safe to Ctrl+C |
| 6 | Use `ST_MakeValid()` on all geometries in spatial joins | HARD | Known invalid geometries in existing GIS data |
| 7 | Set `statement_timeout = '120s'` on enrichment queries | HARD | Prevent runaway queries |
| 8 | Use `flush=True` on all print statements | SOFT | Line-buffered output for monitoring |
| 9 | Apply Austin metro bbox filter (-98.2, 29.8, -97.2, 30.8) for statewide layers | HARD | Limit data volume to relevant area |
| 10 | Skip ETL if `gis_layers_registry.sync_status = 'complete'` | SOFT | Faster re-runs; prevents duplicate downloads |

---

### Non-Goals

1. No frontend UI changes — this is backend data only
2. No new API endpoints — enrichment data served via existing property endpoints
3. No modification of existing enrichment columns (zoning_local, flood_zone, nearest_water_ft, nearest_sewer_ft, nearest_storm_ft)
4. No downloading water/wastewater/stormwater from Texas Infrastructure Map — already have 1.5M+ utility features
5. No real-time sync or scheduled jobs — one-time ETL with manual re-run capability
6. No geocoding or address parsing — properties already have `location` geometry

---

### Style & UX Notes

- Scripts output progress to stdout with `flush=True` for real-time monitoring
- Final summary prints enrichment counts for all new columns
- Scripts are standalone and runnable independently (no shared state between runs)
- Each script prints which endpoint it's processing and row counts
- Error messages include endpoint URL and HTTP status for debugging

---

### Key Concepts

| Term | Definition |
|------|------------|
| **FLUM** | Future Land Use Map — City of Austin planning designation showing intended future zoning, not current zoning |
| **AADT** | Annual Average Daily Traffic — TxDOT metric for average vehicles per day on a road segment |
| **ETJ** | Extraterritorial Jurisdiction — area outside city limits where the city has limited planning/development authority |
| **ETJ Released** | Tracts formally released from a city's ETJ, typically annexed by another city or returned to county jurisdiction |
| **Point-in-polygon** | Spatial join where a point geometry is tested for containment within polygon geometries |
| **Nearest-neighbor** | Spatial join finding the closest feature within a threshold distance (e.g., 500ft) |
| **unified_group** | Column in `gis_infrastructure` that categorizes features (e.g., 'future_land_use', 'traffic_aadt', 'city_limits') |

---

### Open Questions (Resolved)

| Question | Answer |
|----------|--------|
| Where should ETL scripts be created? | Project root `/Users/braydonirwin/scoutgpt-api/` |
| Which Texas Infrastructure Map layers to download? | Priority only: electric transmission, gas pipelines, rail, telecom |
| AADT source priority? | Travis County AADT points first; TxDOT roadway polylines as fallback |
| Add column for ETJ Released tracts? | Yes — add `etj_released` BOOLEAN column |
| Value for properties outside all jurisdictions? | Set `city_jurisdiction = 'UNINCORPORATED'` |
| Re-download already-synced layers? | No — skip if `sync_status = 'complete'` |
| Logging destination? | Stdout only (user can redirect) |
| Can ETL scripts run in parallel? | Yes — they're independent |

---

### Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Neon PostgreSQL + PostGIS | Database | Connection string in prompt; US East Ohio region |
| City of Austin MapServer | External API | `/gis/rest/` (NOT `/arcgis/rest/`) |
| Travis County MapServer | External API | `/server1/rest/services/` |
| TxDOT FeatureServer | External API | ArcGIS Online hosted service |
| ArcGIS Online | External API | For Texas Infrastructure Map discovery |
| psycopg v3 | Python package | `pip install psycopg[binary]` |
| requests | Python package | For HTTP calls to ArcGIS REST APIs |

---

### Data Sources Summary

| Source | Endpoint | Geometry | unified_group |
|--------|----------|----------|---------------|
| Austin FLUM | `maps.austintexas.gov/.../MapServer/4` | Polygon | `future_land_use` |
| Travis County AADT | `gis.traviscountytx.gov/.../MapServer/0` | Point | `traffic_aadt` |
| TxDOT Roadways | `services.arcgis.com/.../FeatureServer/0` | Polyline | `traffic_roadways` |
| City Limits | `gis.traviscountytx.gov/.../MapServer/0` | Polygon | `city_limits` |
| ETJ Boundaries | `gis.traviscountytx.gov/.../MapServer/1` | Polygon | `etj_boundaries` |
| ETJ Released | `gis.traviscountytx.gov/.../MapServer/2` | Polygon | `etj_released` |
| TX Infrastructure | TBD via discovery | Various | `electric_transmission`, `gas_pipelines`, `rail_lines`, `telecom` |

---

### Deliverables

| Script | Purpose |
|--------|---------|
| `discover_endpoints.py` | Query all endpoints, print field schemas, record counts, SRIDs |
| `flum_etl.py` | Download Austin FLUM polygons |
| `aadt_etl.py` | Download Travis County AADT points + TxDOT Roadway polylines |
| `boundaries_etl.py` | Download City Limits + ETJ + ETJ Released |
| `tx_infra_etl.py` | Discover and download Texas Infrastructure Map priority layers |
| `enrich_flu.py` | Batched point-in-polygon FLU enrichment |
| `enrich_aadt.py` | Batched nearest-AADT enrichment (points first, polylines fallback) |
| `enrich_jurisdiction.py` | Batched City Limits + ETJ + ETJ Released + UNINCORPORATED enrichment |

---

### Success Criteria

After running all scripts:
- [ ] `gis_layers_registry` has entries for all discovered endpoints with field schemas
- [ ] `gis_infrastructure` has rows with `unified_group` IN ('future_land_use', 'traffic_aadt', 'traffic_roadways', 'city_limits', 'etj_boundaries', 'etj_released', 'electric_transmission', 'gas_pipelines', 'rail_lines', 'telecom')
- [ ] `properties.future_land_use` populated for properties within Austin FLUM coverage area
- [ ] `properties.nearest_road_aadt` populated for properties within 500ft of AADT station or roadway
- [ ] `properties.city_jurisdiction` populated for ALL 418,647 properties (either city name or 'UNINCORPORATED')
- [ ] `properties.in_etj` + `properties.etj_city` populated for properties in ETJ
- [ ] `properties.etj_released` populated for properties in released ETJ tracts
- [ ] All scripts complete without error
- [ ] All scripts are idempotent (safe to re-run)
