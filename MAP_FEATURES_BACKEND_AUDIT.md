# ScoutGPT Backend & Database Audit for Map Features

**Generated:** 2026-02-24
**Purpose:** Complete audit of backend API and database to support 7 frontend map features

---

## TABLE OF CONTENTS

1. [Global Configuration](#1-global-configuration)
2. [All API Endpoints](#2-all-api-endpoints)
3. [All Database Tables](#3-all-database-tables)
4. [All SQL Queries](#4-all-sql-queries)
5. [All Spatial Capabilities](#5-all-spatial-capabilities)
6. [Claude AI Tools](#6-claude-ai-tools)
7. [GIS Service Audit](#7-gis-service-audit)
8. [Map Features Gap Analysis](#8-map-features-gap-analysis)
9. [Missing Endpoints Needed](#9-missing-endpoints-needed)
10. [Database Gaps](#10-database-gaps)

---

## 1. GLOBAL CONFIGURATION

### package.json
```json
{
  "name": "scoutgpt-api",
  "version": "1.0.0",
  "description": "ScoutGPT v2 Backend API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.74.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "pg": "^8.13.1"
  },
  "engines": {
    "node": ">=18"
  }
}
```

### server.js (Entry Point) — 59 lines
```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { loadRegistry } = require('./services/registryService');

const app = express();
const PORT = process.env.PORT || 3001;

// Routes mounted:
app.use('/api/health', require('./routes/health'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/properties/filter', require('./routes/filter'));
app.use('/api/property', require('./routes/property'));
app.use('/api', require('./routes/intelligence'));
app.use('/api/layers', require('./routes/layers'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api', require('./routes/streetview'));
app.use('/api/gis', require('./routes/gis'));
```

### .env.example
```
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require
PORT=3001
CORS_ORIGIN=http://localhost:5173
ANTHROPIC_API_KEY=sk-ant-...
```

### db/pool.js — Database Connection
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

**Pool Configuration:**
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds
- SSL: Required (rejectUnauthorized: false)

---

## 2. ALL API ENDPOINTS

### Routes Summary

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/health` | health.js | Health check |
| GET | `/api/properties` | properties.js | Get properties (bbox, filters) |
| POST | `/api/properties/filter` | filter.js | Filter properties (complex filters) |
| GET | `/api/properties/filter/options` | filter.js | Get available filter options |
| GET | `/api/property/:attomId` | property.js | Get single property detail |
| POST | `/api/intelligence/search` | intelligence.js | NLQ search |
| GET | `/api/layers/geojson` | layers.js | Get GeoJSON layer |
| GET | `/api/layers/available` | layers.js | List available layers |
| POST | `/api/chat` | chat.js | Chat with Claude |
| GET | `/api/streetview/:attomId` | streetview.js | Get street view image |
| GET | `/api/gis/water` | gis.js | Water lines GeoJSON |
| GET | `/api/gis/sewer` | gis.js | Sewer lines GeoJSON |
| GET | `/api/gis/storm` | gis.js | Storm drains GeoJSON |
| GET | `/api/gis/zoning` | gis.js | Zoning districts GeoJSON |
| GET | `/api/gis/flood` | gis.js | Floodplains GeoJSON |
| GET | `/api/gis/traffic-roadways` | gis.js | Traffic roadways GeoJSON |
| GET | `/api/gis/traffic-aadt` | gis.js | AADT stations GeoJSON |
| GET | `/api/gis/city-limits` | gis.js | City limits GeoJSON |
| GET | `/api/gis/etj-boundaries` | gis.js | ETJ boundaries GeoJSON |
| GET | `/api/gis/etj-released` | gis.js | Released ETJ GeoJSON |
| GET | `/api/gis/future-land-use` | gis.js | Future land use GeoJSON |

---

### routes/properties.js — 66 lines

**GET /api/properties**

Query Parameters:
- `bbox` — Bounding box as "west,south,east,north"
- `zipCode` — Filter by ZIP code
- `propertyType` — ATTOM codes (comma-separated)
- `minAcres`, `maxAcres` — Lot size filter
- `minValue`, `maxValue` — Assessed value filter
- `absenteeOwner` — Boolean
- `limit` — Max results (default 500, max 2000)

Response Shape:
```json
[
  {
    "attomId": 123456,
    "addressFull": "123 Main St",
    "latitude": 30.267153,
    "longitude": -97.743057,
    "propertyUseStandardized": "369",
    "yearBuilt": 1985,
    "bedroomsCount": 3,
    "bathCount": 2,
    "areaBuilding": 1500,
    "areaLotAcres": 0.25,
    "taxAssessedValueTotal": 450000,
    "lastSaleDate": "2020-05-15",
    "lastSalePrice": 425000
  }
]
```

---

### routes/filter.js — 174 lines

**POST /api/properties/filter**

Request Body:
```json
{
  "bbox": { "west": -97.8, "south": 30.2, "east": -97.7, "north": 30.3 },
  "assetClass": ["multifamily", "office"],
  "lotSizeMin": 0.5,
  "lotSizeMax": 10,
  "buildingSizeMin": 5000,
  "buildingSizeMax": 100000,
  "yearBuiltMin": 1970,
  "yearBuiltMax": 2020,
  "stories": 3,
  "ownerType": ["corporate", "trust"],
  "absenteeOnly": true,
  "ownerName": "Smith",
  "soldWithinDays": 365,
  "salePriceMin": 500000,
  "salePriceMax": 5000000,
  "armsLengthOnly": true,
  "investorOnly": false,
  "distressedSalesOnly": false,
  "ltvMin": 50,
  "ltvMax": 90,
  "highLtvOnly": false,
  "equityMin": 100000,
  "equityMax": 500000,
  "hasForeclosure": true,
  "foreclosureType": ["LIS", "NOD", "NTS"],
  "foreclosureFiledDays": 90,
  "auctionWithinDays": 30,
  "distressScoreMin": 60,
  "floodRiskMin": 50,
  "inFloodZone": true,
  "limit": 5000
}
```

**GET /api/properties/filter/options**

Response:
```json
{
  "assetClasses": [
    { "id": "singleFamily", "label": "Single Family" },
    { "id": "multifamily", "label": "Multifamily" },
    { "id": "office", "label": "Office" }
  ],
  "ownerTypes": [...],
  "foreclosureTypes": [...],
  "tabs": { "active": [...], "comingSoon": [...] }
}
```

---

### routes/property.js — 21 lines

**GET /api/property/:attomId**

Returns full property detail with 8-table join:
- properties + property_details
- ownership
- tax_assessments (last 5 years)
- sales_transactions (last 10) with mortgages
- current_loans
- property_valuations
- climate_risk
- building_permits (last 20)
- foreclosure_records

---

### routes/gis.js — 62 lines

All GIS endpoints accept:
- `bbox` — Required, format: "west,south,east,north"

Returns GeoJSON FeatureCollection with cache header: `Cache-Control: public, max-age=300`

Layer types supported:
- `water` — Water lines
- `sewer` — Sewer lines
- `storm` — Storm drains
- `zoning` — Zoning districts
- `flood` — Floodplains
- `traffic_roadways` — TxDOT roadways
- `traffic_aadt` — Traffic count stations
- `city_limits` — City boundaries
- `etj_boundaries` — ETJ areas
- `etj_released` — Released ETJ areas
- `future_land_use` — Future land use plans

---

### routes/chat.js

**POST /api/chat**

Request Body:
```json
{
  "messages": [
    { "role": "user", "content": "Find multifamily in 78704" }
  ],
  "context": {
    "selectedAttomId": 123456,
    "viewport": { "west": -97.8, "south": 30.2, "east": -97.7, "north": 30.3 }
  }
}
```

Response:
```json
{
  "text": "I found 45 multifamily properties in 78704...",
  "properties": [123456, 234567, 345678],
  "propertyMarkers": [
    { "attomId": 123456, "latitude": 30.25, "longitude": -97.75 }
  ]
}
```

---

### routes/streetview.js

**GET /api/streetview/:attomId**

Response:
```json
{
  "imageUrl": "https://maps.googleapis.com/maps/api/streetview?...",
  "source": "streetview",
  "googleMapsUrl": "https://www.google.com/maps/@30.25,-97.75,3a,75y"
}
```

Fallback to Mapbox satellite if Street View unavailable.

---

## 3. ALL DATABASE TABLES

### Tables Summary

| Table | Rows | Key Columns |
|-------|------|-------------|
| properties | 444,312 | attom_id, address_full, latitude, longitude, location (GEOMETRY), property_use_standardized, tax_assessed_value_total |
| property_details | 444,312 | attom_id, construction_type, quality_grade (0% populated), condition (0% populated) |
| ownership | 444,312 | attom_id, owner1_name_full, is_absentee_owner, company_flag, trust_flag |
| sales_transactions | 1,521,885 | transaction_id, attom_id, sale_price, recording_date, is_distressed, is_foreclosure_auction |
| current_loans | 359,725 | attom_id, loan_amount, interest_rate, due_date (0% populated), estimated_balance (0% populated) |
| tax_assessments | 444,312 | attom_id, assessed_value_total, market_value_total, tax_delinquent_year (0% populated) |
| property_valuations | 344,536 | attom_id, estimated_value (0% populated), estimated_rental_value, ltv, available_equity |
| foreclosure_records | 45,744 | attom_id, record_type, auction_date, default_amount, status (0% populated) |
| climate_risk | 415,847 | attom_id, heat_risk_score, flood_risk_score, total_risk_score (0% populated) |
| building_permits | 3,528,225 | permit_id, attom_id, permit_type, job_value, effective_date |
| parcel_boundaries | 428,529 | attom_id, geometry (POLYGON) |
| fema_flood_zones | 14,043 | zone_type, is_sfha, geometry (POLYGON) |
| school_districts | 1,020 | name, level, geometry (POLYGON) |
| mortgage_records | 1,146,011 | transaction_id, loan_amount, due_date (52% populated) |
| gis_infrastructure | N/A | unified_group, geom, diameter, material, zone_code, flood_zone, attributes |
| filters_registry | 96 | filter_slug, filter_name, category, operator_type |
| v_filter_joins | N/A | source_table, join_clause |

### Key Spatial Columns

**properties table:**
- `location` — PostGIS GEOMETRY (POINT), 88.5% populated
- `latitude` / `longitude` — 88.5% populated

**parcel_boundaries table:**
- `geometry` — PostGIS GEOMETRY (POLYGON)
- Has GIST spatial index

**gis_infrastructure table:**
- `geom` — PostGIS GEOMETRY
- Has GIST spatial index

---

## 4. ALL SQL QUERIES

### propertyService.searchProperties()

```sql
SELECT p.attom_id, p.fips_code, p.parcel_number_raw, p.address_full,
  p.address_city, p.address_state, p.address_zip, p.latitude, p.longitude,
  p.property_use_standardized, p.year_built, p.bedrooms_count, p.bath_count,
  p.area_building, p.area_lot_sf, p.area_lot_acres, p.tax_assessed_value_total,
  p.last_sale_date, p.last_sale_price,
  p.zoning_local, p.zoning_jurisdiction, p.flood_zone, p.flood_zone_desc, p.in_floodplain,
  p.nearest_water_ft, p.nearest_water_diam, p.nearest_water_material,
  p.nearest_sewer_ft, p.nearest_sewer_diam, p.nearest_storm_ft, p.nearest_storm_diam
FROM properties p
WHERE p.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
  AND [dynamic filters]
ORDER BY [sortBy] [sortOrder]
LIMIT $n
```

**Spatial filter:** Uses `&&` (bounding box overlap) operator with `ST_MakeEnvelope()`

### propertyService.getPropertyDetail()

8 parallel queries:
```sql
-- 1. Property + details
SELECT p.*, pd.* FROM properties p
LEFT JOIN property_details pd ON pd.attom_id = p.attom_id
WHERE p.attom_id = $1

-- 2. Ownership
SELECT * FROM ownership WHERE attom_id = $1 ORDER BY ownership_sequence ASC

-- 3. Tax assessments
SELECT * FROM tax_assessments WHERE attom_id = $1 ORDER BY tax_year DESC LIMIT 5

-- 4. Sales transactions
SELECT * FROM sales_transactions WHERE attom_id = $1 ORDER BY recording_date DESC LIMIT 10

-- 5. Current loans
SELECT * FROM current_loans WHERE attom_id = $1 ORDER BY loan_position ASC

-- 6. Valuations
SELECT * FROM property_valuations WHERE attom_id = $1 ORDER BY valuation_date DESC LIMIT 5

-- 7. Climate risk
SELECT * FROM climate_risk WHERE attom_id = $1

-- 8. Building permits
SELECT * FROM building_permits WHERE attom_id = $1 ORDER BY effective_date DESC LIMIT 20

-- 9. Foreclosure records
SELECT * FROM foreclosure_records WHERE attom_id = $1 ORDER BY foreclosure_recording_date DESC

-- 10. Mortgages (for each sale)
SELECT * FROM mortgage_records WHERE transaction_id = $1 ORDER BY mortgage_position ASC
```

### spatialService.propertiesWithinRadius()

```sql
SELECT attom_id, address_full, address_city, address_zip, latitude, longitude,
  property_use_standardized, year_built, area_building, tax_assessed_value_total,
  last_sale_price, last_sale_date,
  ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters
FROM properties
WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
ORDER BY distance_meters ASC
LIMIT $4
```

**Uses:** `ST_DWithin()` for radius search, `ST_Distance()` for distance calculation

### gisService.queryByBbox()

```sql
SELECT
  id,
  ST_AsGeoJSON(geom)::json as geometry,
  diameter,
  material,
  zone_code,
  flood_zone,
  source_server,
  attributes
FROM gis_infrastructure
WHERE unified_group = $1
  AND ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
LIMIT 15000
```

**Uses:** `ST_Intersects()` with `ST_MakeEnvelope()` for bbox query

### filterService.filterProperties()

Complex dynamic query builder with:
- Asset class code conditions (with split logic for codes 401, 383)
- Owner type conditions (individual, corporate, trust, government, builder)
- Foreclosure type conditions
- Multiple JOINs to ownership, foreclosure_records, property_valuations

---

## 5. ALL SPATIAL CAPABILITIES

### PostGIS Extension: ENABLED

### Spatial Functions Used

| Function | Usage |
|----------|-------|
| `ST_MakeEnvelope(west, south, east, north, 4326)` | Create bounding box |
| `ST_Intersects(geom, envelope)` | Bbox intersection query |
| `&&` (overlap operator) | Fast bbox filter |
| `ST_DWithin(geom, point, meters)` | Radius search |
| `ST_Distance(geom1, geom2)` | Calculate distance |
| `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` | Create point |
| `ST_AsGeoJSON(geom)` | Convert to GeoJSON |
| `::geography` | Cast to geography for meter-based calculations |

### Spatial Indexes

**properties.location:**
- Type: GIST index
- Enables: `&&` operator, ST_Intersects

**parcel_boundaries.geometry:**
- Type: GIST index
- Has 428,529 polygons

**gis_infrastructure.geom:**
- Type: GIST index
- Queried by unified_group + ST_Intersects

### Existing Spatial Endpoints

1. **Radius Query:** `spatial_query` tool (via Claude)
   - Uses `ST_DWithin()` for meter-based radius search
   - Returns properties within radius with distance

2. **Bbox Query:** All property search endpoints
   - Uses `&&` operator with `ST_MakeEnvelope()`
   - Fast filtering by map viewport

3. **GIS Layer Query:** `/api/gis/*` endpoints
   - Uses `ST_Intersects()` with `ST_MakeEnvelope()`
   - Returns GeoJSON FeatureCollection

### NO Polygon Draw Endpoint

**MISSING:** No endpoint accepts a GeoJSON polygon and returns properties within it.

Current spatial queries only support:
- Bounding box (rectangle)
- Point + radius (circle)

---

## 6. CLAUDE AI TOOLS

### Model: claude-sonnet-4-20250514

### Tools Defined (4 total)

#### 1. search_properties
```json
{
  "name": "search_properties",
  "parameters": {
    "bbox": "minLng,minLat,maxLng,maxLat",
    "zipCode": "5-digit ZIP",
    "city": "City name (partial match)",
    "propertyType": "ATTOM codes comma-separated",
    "minAcres": "number",
    "maxAcres": "number",
    "minValue": "number",
    "maxValue": "number",
    "absenteeOwner": "boolean",
    "ownerOccupied": "boolean",
    "corporateOwned": "boolean",
    "foreclosure": "boolean",
    "taxDelinquent": "boolean",
    "recentSales": "boolean",
    "highEquity": "boolean",
    "zoningCodes": "string",
    "zoningCategory": "residential|commercial|industrial|mixed_use|agricultural",
    "jurisdiction": "string",
    "excludeFloodplain": "boolean",
    "floodZones": "string",
    "maxWaterDistanceFt": "number",
    "minWaterDiameterIn": "number",
    "maxSewerDistanceFt": "number",
    "maxStormDistanceFt": "number",
    "sortBy": "column",
    "sortOrder": "asc|desc",
    "limit": "number (max 25)"
  }
}
```

#### 2. get_property_details
```json
{
  "name": "get_property_details",
  "parameters": {
    "attomId": "ATTOM property ID",
    "address": "Street address for search"
  }
}
```

#### 3. get_market_stats
```json
{
  "name": "get_market_stats",
  "parameters": {
    "zipCode": "string",
    "fipsCode": "string",
    "propertyType": "ATTOM code"
  }
}
```

#### 4. spatial_query
```json
{
  "name": "spatial_query",
  "parameters": {
    "longitude": "number (required)",
    "latitude": "number (required)",
    "radiusMeters": "number (default 1000)",
    "limit": "number"
  }
}
```

---

## 7. GIS SERVICE AUDIT

### gisService.js — 189 lines

**Unified Groups (layer types):**
```javascript
const UNIFIED_GROUPS = {
  water: 'water_lines',
  sewer: 'wastewater_lines',
  storm: 'stormwater_lines',
  zoning: 'zoning_districts',
  flood: 'floodplains',
  traffic_roadways: 'traffic_roadways',
  traffic_aadt: 'traffic_aadt',
  city_limits: 'city_limits',
  etj_boundaries: 'etj_boundaries',
  etj_released: 'etj_released',
  future_land_use: 'future_land_use',
};
```

**Feature limit:** 15,000 per request

**GeoJSON output for each layer type:**

| Layer | Properties |
|-------|------------|
| water | id, source, diameter, material |
| sewer | id, source, diameter, material |
| storm | id, source, diameter, material |
| zoning | id, source, zone_code, zone_category |
| flood | id, source, flood_zone, is_sfha |
| traffic_roadways | id, RTE_PRFX, RTE_NBR, MAP_LBL, DES_DRCT, road_name |
| traffic_aadt | id, _AADT, _AADT_YEAR, CNTY, F2001-F2020 (historical) |
| city_limits | id, city_name, zone_code |
| etj_boundaries | id, jurisdiction, zone_code |
| etj_released | id, jurisdiction, zone_code, release_date |
| future_land_use | id, land_use_code, land_use_desc, zone_code |

---

## 8. MAP FEATURES GAP ANALYSIS

### Feature 1: FlyTo (Navigate to Property)

**Requirement:** Property detail endpoint returns lat/lng coordinates

**STATUS: ✅ SUPPORTED**

- `GET /api/property/:attomId` returns `latitude` and `longitude`
- `searchProperties` returns `latitude` and `longitude` for each property
- 88.5% of properties have coordinates

**No new endpoint needed.**

---

### Feature 2: Geocoder (Address Search)

**Requirement:** Endpoint accepts address string, returns coordinates

**STATUS: ⚠️ PARTIAL**

Current capability:
- `get_property_details` tool accepts `address` parameter
- Uses `searchProperties({ addressSearch })` — but this filters by `address_full`

**ISSUE:** No fuzzy geocoding. The current implementation does an exact/partial match on the database `address_full` column. It cannot geocode arbitrary addresses that don't exist in the database.

**RECOMMENDATION:** Use Mapbox Geocoding API client-side for general geocoding. For property-specific searches, the existing endpoint works.

---

### Feature 3: Map Export (Save Map Image)

**Requirement:** Server-side map rendering capability

**STATUS: ❌ NOT SUPPORTED**

No server-side rendering capability exists. The backend only returns data (GeoJSON, property lists).

**RECOMMENDATION:** This is best done client-side using:
- `map.getCanvas().toDataURL()` (Mapbox GL JS)
- Or a client-side library like `html2canvas`

No backend endpoint needed.

---

### Feature 4: Clustering (Property Count Aggregation)

**Requirement:** API returns property counts by grid cell or cluster

**STATUS: ❌ NOT SUPPORTED**

Current behavior:
- `searchProperties` returns individual properties (limit 2000)
- No aggregation endpoint

**MISSING ENDPOINT:** Need an endpoint that returns:
```json
{
  "clusters": [
    { "center": [lng, lat], "count": 150, "bounds": {...} },
    { "center": [lng, lat], "count": 75, "bounds": {...} }
  ]
}
```

**RECOMMENDATION:** Add `/api/properties/clusters` endpoint with SQL like:
```sql
SELECT
  ST_X(ST_Centroid(ST_Collect(location))) as lng,
  ST_Y(ST_Centroid(ST_Collect(location))) as lat,
  COUNT(*) as count,
  ST_Extent(location) as bounds
FROM properties
WHERE location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
  AND [filters]
GROUP BY ST_SnapToGrid(location, [grid_size])
```

---

### Feature 5: Heatmap (Value Visualization)

**Requirement:** API returns assessed_value/AVM by location for bbox

**STATUS: ⚠️ PARTIAL (data gaps)**

**Valuation Data Availability:**
- `tax_assessed_value_total` — 100% populated ✅
- `estimated_value` (AVM) — 0% populated ❌
- `available_equity` — 93.4% populated ✅
- `ltv` — 93.4% populated ✅

**Current capability:**
- `searchProperties` returns `tax_assessed_value_total` for each property
- Frontend can use these points to generate a heatmap

**ISSUE:** No server-side aggregation. For large areas, returning individual points is inefficient.

**RECOMMENDATION:** Add `/api/properties/heatmap` endpoint with hexbin aggregation:
```sql
SELECT
  ST_X(ST_Centroid(hexagon)) as lng,
  ST_Y(ST_Centroid(hexagon)) as lat,
  AVG(tax_assessed_value_total) as avg_value,
  SUM(tax_assessed_value_total) as total_value,
  COUNT(*) as count
FROM properties, h3_grid(bbox, resolution)
WHERE location && hexagon
GROUP BY hexagon
```

---

### Feature 6: Measure (Distance Calculation)

**Requirement:** Distance calculation endpoints

**STATUS: ⚠️ PARTIAL**

**Current capability:**
- `spatial_query` tool returns `distance_meters` from a center point
- Uses `ST_Distance()` with geography casting for accurate meter calculations

**MISSING:** No direct endpoint for measuring arbitrary line distances or areas.

**RECOMMENDATION:** For measuring tool, calculations should be done client-side using:
- Mapbox GL JS draw plugin for line/polygon drawing
- `turf.js` for distance/area calculations

No backend endpoint needed — this is a pure frontend feature.

---

### Feature 7: Polygon Draw (Custom Area Selection)

**Requirement:** API accepts GeoJSON polygon, returns properties within it

**STATUS: ❌ NOT SUPPORTED**

**Current spatial queries:**
- Bbox: `&&` operator with `ST_MakeEnvelope()` ✅
- Radius: `ST_DWithin()` ✅
- Polygon: ❌ NO ENDPOINT

**MISSING ENDPOINT:** Need `POST /api/properties/polygon` that accepts:
```json
{
  "polygon": {
    "type": "Polygon",
    "coordinates": [[[-97.8, 30.2], [-97.7, 30.2], [-97.7, 30.3], [-97.8, 30.3], [-97.8, 30.2]]]
  },
  "filters": {
    "propertyType": "369,373",
    "minValue": 500000
  }
}
```

**Required SQL:**
```sql
SELECT p.*
FROM properties p
WHERE ST_Intersects(
  p.location,
  ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
)
AND [filters]
LIMIT $n
```

**PostGIS functions needed:**
- `ST_GeomFromGeoJSON()` — Parse GeoJSON polygon
- `ST_Intersects()` — Find properties inside polygon

---

## 9. MISSING ENDPOINTS NEEDED

### Priority 1: Polygon Query (for Draw Tool)

**Endpoint:** `POST /api/properties/polygon`

```javascript
// Request
{
  "polygon": { "type": "Polygon", "coordinates": [...] },
  "filters": { /* same as /filter endpoint */ },
  "limit": 5000
}

// Response
{
  "properties": [...],
  "totalCount": 1250,
  "bbox": { "west": -97.8, "south": 30.2, "east": -97.7, "north": 30.3 }
}
```

**SQL:**
```sql
SELECT p.* FROM properties p
WHERE ST_Intersects(p.location, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
  AND [filters]
LIMIT $n
```

---

### Priority 2: Cluster Aggregation (for Clustering)

**Endpoint:** `GET /api/properties/clusters`

```javascript
// Request (query params)
?bbox=-97.8,30.2,-97.7,30.3
&zoom=12
&filters[propertyType]=369,373

// Response
{
  "clusters": [
    {
      "id": "h3_abc123",
      "center": [-97.75, 30.25],
      "count": 156,
      "totalValue": 78000000,
      "avgValue": 500000
    }
  ],
  "totalProperties": 2450
}
```

---

### Priority 3: Heatmap Aggregation (for Value Heatmap)

**Endpoint:** `GET /api/properties/heatmap`

```javascript
// Request
?bbox=-97.8,30.2,-97.7,30.3
&metric=tax_assessed_value_total  // or available_equity, ltv
&resolution=8  // H3 resolution

// Response
{
  "cells": [
    { "center": [-97.75, 30.25], "value": 12500000, "count": 25 }
  ],
  "bounds": { "min": 100000, "max": 5000000 }
}
```

---

## 10. DATABASE GAPS

### Columns with 0% Population (DEAD COLUMNS)

**properties table:**
- `parcel_number_formatted`
- `property_use_code`
- `zoning` (use `zoning_local` instead)
- `county_name`
- `cbsa_name`
- `congressional_district`

**property_details table:**
- `condition` — Cannot evaluate property condition
- `quality_grade` — Cannot determine Class A/B/C
- `has_loading_platform`
- `has_overhead_door`

**current_loans table:**
- `loan_term`
- `due_date` — Cannot filter by maturing notes
- `estimated_balance` — Cannot calculate current LTV
- `estimated_monthly_payment`

**tax_assessments table:**
- `tax_rate`
- `tax_delinquent_year` — Cannot filter tax delinquent properties

**property_valuations table:**
- `estimated_value` (AVM) — Cannot show AVM heatmap
- `confidence_score`

**foreclosure_records table:**
- `status` — Cannot filter active vs resolved foreclosures

**climate_risk table:**
- `total_risk_score`
- `wind_risk_score`
- `air_quality_risk_score`

### Impact on Map Features

| Feature | Impact |
|---------|--------|
| FlyTo | None — coordinates are populated |
| Geocoder | None — use Mapbox API |
| Map Export | None — client-side feature |
| Clustering | **Counts will work**, value aggregation limited to `tax_assessed_value_total` |
| Heatmap | **Cannot use AVM** — must use `tax_assessed_value_total` instead |
| Measure | None — client-side feature |
| Polygon Draw | None — spatial functions work fine |

### Recommended Data Fixes

1. **Tax Delinquency:** Need to populate `tax_assessments.tax_delinquent_year` from ATTOM
2. **Loan Maturity:** Need to populate `current_loans.due_date` and `estimated_balance` from ATTOM
3. **AVM Values:** Need to populate `property_valuations.estimated_value` from ATTOM
4. **Foreclosure Status:** Need to populate `foreclosure_records.status` from ATTOM

---

## SUMMARY

### What Works Now

| Feature | Status | Notes |
|---------|--------|-------|
| FlyTo | ✅ Ready | Properties have lat/lng |
| Geocoder | ✅ Ready | Use Mapbox API client-side |
| Map Export | ✅ Ready | Use canvas.toDataURL() client-side |
| Measure | ✅ Ready | Use turf.js client-side |

### What Needs Backend Work

| Feature | Status | Endpoint Needed |
|---------|--------|-----------------|
| Polygon Draw | ❌ Missing | `POST /api/properties/polygon` |
| Clustering | ❌ Missing | `GET /api/properties/clusters` |
| Heatmap | ⚠️ Partial | `GET /api/properties/heatmap` (optional, can use existing data) |

### New Endpoints to Build

1. **`POST /api/properties/polygon`** — Returns properties within a drawn polygon
2. **`GET /api/properties/clusters`** — Returns aggregated counts for clustering
3. **`GET /api/properties/heatmap`** — Returns hex-binned values for heatmap (optional)

### PostGIS Functions Available

All required PostGIS functions are available:
- `ST_GeomFromGeoJSON()` ✅
- `ST_Intersects()` ✅
- `ST_DWithin()` ✅
- `ST_Distance()` ✅
- `ST_SnapToGrid()` ✅
- `ST_Collect()` ✅
- `ST_Centroid()` ✅
- `ST_Extent()` ✅

---

*End of Audit*
