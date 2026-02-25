# ScoutGPT Data & Database Style Guide

**What IS, not what SHOULD BE**

This guide documents the actual database and data patterns found in the codebase.

---

## 1. Database Technology

**Stack:**
- **PostgreSQL 16** with **PostGIS** extension
- **Neon** (serverless Postgres, US East Ohio)
- **ATTOM Data** (842 fields, 158M+ properties nationwide, licensed)
- **Travis County, TX** dataset (444,000+ properties)

**Citation:** CLAUDE.md:6-10, db/pool.js:15-17

---

## 2. Connection Management

### Pool Configuration

**Pattern: Singleton pool with Neon serverless**
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
```
**Citation:** db/pool.js:1-19

**Key settings:**
- `max: 20` connections
- `idleTimeoutMillis: 30000` (30 seconds)
- `connectionTimeoutMillis: 10000` (10 seconds)
- SSL enabled with `rejectUnauthorized: false` (required for Neon)

**No transaction management patterns found** - all queries use auto-commit.

---

## 3. Schema & Table Structure

### Core Tables

**14 tables linked by `attom_id` (BIGINT, primary key):**

1. **properties** - Core property data (address, type, year, size, location, last sale)
2. **property_details** - Construction details (roof, HVAC, condition, quality_grade)
3. **ownership** - Owner records (names, flags, absentee status, transfer dates)
4. **sales_transactions** - Sales history (recording_date, sale_price, arms_length flag)
5. **mortgage_records** - Historical mortgages (linked to sales via transaction_id)
6. **current_loans** - Active loans (balance, rate, lender, position)
7. **tax_assessments** - Tax records (assessed values, exemptions, delinquency)
8. **property_valuations** - AVM estimates (value, confidence, rental estimate, equity)
9. **foreclosure_records** - Foreclosure filings (status, auction_date, default_amount)
10. **building_permits** - Permit history (type, value, effective_date)
11. **climate_risk** - Climate scores (flood, heat, storm, wildfire, total_risk_score)
12. **fema_flood_zones** - Flood zone classifications (is_sfha, zone_type)
13. **school_districts** - School boundaries (name, level)
14. **gis_infrastructure** - Unified GIS features (zoning, flood, water, sewer, storm)

**Citation:** knowledge/system-prompt.js:71-84, services/gisService.js:3-9

### Naming Conventions

**Pattern: snake_case for all database identifiers**

- Tables: `properties`, `sales_transactions`, `current_loans`
- Columns: `attom_id`, `address_full`, `last_sale_date`, `property_use_standardized`
- Never camelCase in database schema

**Citation:** All query strings throughout services/

### Primary Keys

**Pattern: `attom_id` (BIGINT) as primary key and foreign key**

```sql
SELECT p.* FROM properties p WHERE p.attom_id = $1
SELECT * FROM ownership WHERE attom_id = $1
SELECT * FROM tax_assessments WHERE attom_id = $1
```
**Citation:** services/propertyService.js:175-198

**Exception:** `gis_infrastructure` uses auto-increment `id` as PK, not linked to properties.
**Citation:** services/gisService.js:23

### Indexes

**Inferred spatial indexes:**
- `properties.location` (PostGIS GEOGRAPHY or GEOMETRY with SRID 4326)
- `gis_infrastructure.geom` (PostGIS GEOMETRY with SRID 4326)

**Evidence:** Use of `&&` operator and `ST_DWithin` suggests GiST indexes exist.
**Citation:** services/propertyService.js:19, services/intelligenceService.js:620

**No explicit index creation found in this repo** - schema managed externally.

---

## 4. Query Patterns

### Parameterized Queries

**CRITICAL RULE: ALL queries use parameterization, NEVER string interpolation.**

**Pattern 1: Manual parameter index tracking**
```javascript
const params = [];
const conditions = [];
let paramIndex = 1;

if (filters.minAcres) {
  conditions.push(`p.area_lot_acres >= $${paramIndex}`);
  params.push(filters.minAcres);
  paramIndex++;
}

if (filters.zipCode) {
  conditions.push(`p.address_zip = $${paramIndex}`);
  params.push(filters.zipCode);
  paramIndex++;
}

const query = `SELECT ... WHERE ${conditions.join(' AND ')} LIMIT $${paramIndex}`;
params.push(limit);

await pool.query(query, params);
```
**Citation:** services/propertyService.js:14-170

**Pattern 2: Array parameter for IN clause**
```javascript
conditions.push(`p.property_use_standardized = ANY($${paramIndex}::text[])`);
params.push(['369', '373', '378']);
paramIndex++;
```
**Citation:** services/propertyService.js:42-44

**Pattern 3: Template literal injection ONLY for validated numeric constants**
```javascript
// Pre-compute numeric values (safe - all from validated defaults)
const minScoreNum = Number(minScore);
const limitNum = Number(limit);

const query = `
  SELECT ...
  HAVING distress_score >= ${minScoreNum}
  LIMIT ${limitNum}
`;
```
**Citation:** services/intelligenceService.js:807-937

**NEVER inject user input via template literals.**

### PostGIS Spatial Queries

**Pattern 1: Bounding box with `&&` operator (uses spatial index)**
```javascript
conditions.push(`p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`);
params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
```
**Citation:** services/propertyService.js:19-20

**Pattern 2: Radius query with `ST_DWithin` (geography, uses spatial index)**
```javascript
ST_DWithin(p2.location::geography, s.location::geography, ${radiusMeters})
```
**Citation:** services/intelligenceService.js:620

**Pattern 3: Geometry intersection**
```javascript
WHERE ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
```
**Citation:** services/gisService.js:33

**Pattern 4: Distance calculation (geography for meters, convert to miles)**
```javascript
ROUND((ST_Distance(p2.location::geography, s.location::geography) / 1609.34)::numeric, 2) AS distance_miles
```
**Citation:** services/intelligenceService.js:611

**Pattern 5: GeoJSON output**
```javascript
SELECT
  id,
  ST_AsGeoJSON(geom)::json as geometry,
  diameter,
  material
FROM gis_infrastructure
```
**Citation:** services/gisService.js:23-26

**Key principle:** Always use `::geography` for distance calculations (meters), not `::geometry` (degrees).

### CTEs (Common Table Expressions)

**Pattern: Multiple CTEs for complex aggregations**

Used extensively in intelligenceService for derived metrics:

```sql
WITH latest_valuation AS (
  SELECT estimated_value, valuation_date
  FROM property_valuations
  WHERE attom_id = $1
  ORDER BY valuation_date DESC
  LIMIT 1
),
latest_tax AS (
  SELECT assessed_value_total, tax_year
  FROM tax_assessments
  WHERE attom_id = $1
  ORDER BY tax_year DESC
  LIMIT 1
),
loan_summary AS (
  SELECT
    COUNT(*) AS loan_count,
    SUM(estimated_balance) AS total_loan_balance
  FROM current_loans
  WHERE attom_id = $1
)
SELECT
  p.*,
  v.estimated_value,
  t.assessed_value_total,
  ls.total_loan_balance
FROM properties p
LEFT JOIN latest_valuation v ON true
LEFT JOIN latest_tax t ON true
LEFT JOIN loan_summary ls ON true
WHERE p.attom_id = $1;
```
**Citation:** services/intelligenceService.js:36-431

**Pattern benefits:**
- Cleaner separation of logic
- Single query execution
- Avoid N+1 problems
- Readable SQL for complex analytics

### JOIN Patterns

**Pattern 1: LATERAL joins for correlated subqueries**
```javascript
LEFT JOIN LATERAL (
  SELECT estimated_value FROM property_valuations
  WHERE attom_id = p.attom_id ORDER BY valuation_date DESC LIMIT 1
) pv ON true
```
**Citation:** services/intelligenceService.js:877-880

**Pattern 2: Standard LEFT JOIN with alias**
```javascript
FROM properties p
LEFT JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1
LEFT JOIN tax_assessments ta ON ta.attom_id = p.attom_id
```
**Citation:** services/intelligenceService.js:828-829

**Pattern 3: CROSS JOIN LATERAL for dynamic filtering**
```javascript
FROM subject s
CROSS JOIN LATERAL (
  SELECT p2.*
  FROM properties p2
  WHERE p2.attom_id != s.attom_id
    AND ST_DWithin(p2.location::geography, s.location::geography, ${radiusMeters})
) p2
```
**Citation:** services/intelligenceService.js:614-623

### Aggregation & Window Functions

**Pattern 1: Basic aggregation**
```javascript
SELECT COUNT(*) as total_properties,
  AVG(tax_assessed_value_total)::numeric(12,2) as avg_assessed_value,
  AVG(last_sale_price)::numeric(12,2) as avg_sale_price
FROM properties
WHERE address_zip = $1
```
**Citation:** services/propertyService.js:250-256

**Pattern 2: GROUP BY with HAVING**
```javascript
SELECT
  UPPER(TRIM(o.owner1_name_full)) AS normalized_name,
  COUNT(DISTINCT o.attom_id) AS property_count,
  SUM(ta.assessed_value_total) AS total_assessed_value
FROM ownership o
JOIN properties p ON p.attom_id = o.attom_id
GROUP BY UPPER(TRIM(o.owner1_name_full))
HAVING COUNT(DISTINCT o.attom_id) >= ${minPropsNum}
ORDER BY property_count DESC
```
**Citation:** services/intelligenceService.js:761-782

**Pattern 3: Array aggregation**
```javascript
ARRAY_AGG(DISTINCT p.property_use_standardized) AS property_types
```
**Citation:** services/intelligenceService.js:765

**Pattern 4: Conditional aggregation with FILTER**
```javascript
COUNT(*) FILTER (WHERE effective_date > CURRENT_DATE - INTERVAL '3 years') AS recent_permits_3yr,
SUM(COALESCE(job_value, 0)) FILTER (WHERE effective_date > CURRENT_DATE - INTERVAL '3 years') AS recent_permit_value_3yr
```
**Citation:** services/intelligenceService.js:134-135

### Sorting & Limiting

**Pattern 1: ORDER BY with NULLS LAST**
```javascript
ORDER BY ${validSortColumns[filters.sortBy]} ${direction} NULLS LAST
```
**Citation:** services/propertyService.js:150

**Pattern 2: Multi-level sorting**
```javascript
ORDER BY similarity_score DESC
ORDER BY tax_year DESC
ORDER BY recording_date DESC
```
**Citation:** services/intelligenceService.js:640, services/propertyService.js:68, services/propertyService.js:192

**Pattern 3: LIMIT capping**
```javascript
const effectiveLimit = Math.min(Math.max(1, limit || 50), 200);
// ...
LIMIT ${effectiveLimit}
```
**Citation:** services/queryBuilder.js:394

---

## 5. Data Types & Casting

### Numeric Types

**Pattern 1: NUMERIC to Number casting**
```javascript
const numericGisFields = ['nearestWaterFt', 'nearestWaterDiam', 'nearestSewerFt'];
for (const field of numericGisFields) {
  if (property[field] != null) property[field] = Number(property[field]);
}
```
**Citation:** services/propertyService.js:220-223

**Pattern 2: ROUND with ::numeric cast**
```javascript
AVG(tax_assessed_value_total)::numeric(12,2) as avg_assessed_value
ROUND((sale_price / area_building)::numeric, 2) AS price_per_sf
```
**Citation:** services/propertyService.js:251, services/intelligenceService.js:612

**Pattern 3: Integer extraction**
```javascript
EXTRACT(YEAR FROM CURRENT_DATE)::int
EXTRACT(DAY FROM AGE(CURRENT_DATE, o.ownership_transfer_date))::int AS days_held
```
**Citation:** services/intelligenceService.js:243, services/intelligenceService.js:244

### Date/Time Handling

**Pattern 1: Date arithmetic with intervals**
```javascript
WHERE p.last_sale_date >= NOW() - INTERVAL '12 months'
WHERE fc.foreclosure_recording_date > CURRENT_DATE - INTERVAL '2 years'
WHERE effective_date > CURRENT_DATE - INTERVAL '3 years'
```
**Citation:** services/propertyService.js:37, services/intelligenceService.js:328, services/intelligenceService.js:134

**Pattern 2: AGE function for durations**
```javascript
EXTRACT(YEAR FROM AGE(CURRENT_DATE, o.ownership_transfer_date))::int AS years_held
```
**Citation:** services/intelligenceService.js:243

**Pattern 3: ISO date strings from frontend**
```javascript
if (typeof value !== 'string' || isNaN(Date.parse(value))) {
  throw new Error(`Requires a valid ISO date string`);
}
```
**Citation:** services/queryBuilder.js:156-159

### Boolean Logic

**Pattern 1: CASE expressions for derived booleans**
```javascript
CASE
  WHEN o.is_absentee_owner = true AND o.company_flag = true THEN 'DEFINITE_INVESTOR'
  WHEN o.is_owner_occupied = true AND t.has_homeowner_exemption = true THEN 'OWNER_OCCUPIED'
  ELSE 'INDETERMINATE'
END AS investor_classification
```
**Citation:** services/intelligenceService.js:292-296

**Pattern 2: Boolean aggregation**
```javascript
bool_or(o.company_flag) AS is_corporate,
bool_or(o.trust_flag) AS is_trust
```
**Citation:** services/intelligenceService.js:769-770

**Pattern 3: Null-safe boolean checks**
```javascript
WHERE (p.in_floodplain = false OR p.in_floodplain IS NULL)
```
**Citation:** services/propertyService.js:96

### String Handling

**Pattern 1: ILIKE for case-insensitive partial match**
```javascript
WHERE p.address_city ILIKE $1
params.push(`%${filters.city}%`)
```
**Citation:** services/propertyService.js:129-131

**Pattern 2: String normalization for matching**
```javascript
UPPER(TRIM(o.owner1_name_full)) AS normalized_name
```
**Citation:** services/intelligenceService.js:762

**Pattern 3: String replacement for normalization**
```javascript
function normalizeOwnerName(raw) {
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+(LLC|INC|CORP|TRUST)\s*$/gi, '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```
**Citation:** services/intelligenceService.js:19-30

### Array Handling

**Pattern: ANY operator with type cast**
```javascript
WHERE p.property_use_standardized = ANY($1::text[])
WHERE p.flood_zone = ANY($1::text[])
```
**Citation:** services/propertyService.js:42, services/propertyService.js:100

---

## 6. Data Normalization

### Column Name Transformation

**Pattern: snake_case to camelCase utility**
```javascript
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRow(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

function normalizeRows(rows) {
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map(normalizeRow);
}
```
**Citation:** utils/normalize.js:1-16

**Usage:**
- Import: `const { normalizeRow, normalizeRows } = require('../utils/normalize');`
- Single row: `const property = normalizeRow(result.rows[0]);`
- Multiple rows: `const sales = normalizeRows(salesResult.rows);`

**Citation:** services/propertyService.js:2, services/propertyService.js:216-217

### Manual Nested Object Construction

**Pattern: Explicit property mapping for complex structures**
```javascript
return {
  attomId: row.attom_id,
  addressFull: row.address_full,

  equity: {
    avmValue: Number(row.avm_value) || null,
    avmLow: Number(row.avm_low) || null,
    estimatedEquity: Number(row.estimated_equity) || null,
    equityPercent: Number(row.equity_percent) || null,
  },

  scores: {
    distressScore: row.distress_score,
    opportunityScore: row.opportunity_score,
  },
};
```
**Citation:** services/intelligenceService.js:439-522

---

## 7. ATTOM Schema Specifics

### Property Type Codes

**CRITICAL: `property_use_standardized` stores NUMERIC ATTOM codes, NOT text labels.**

**Common codes:**
- `369` - Apartment (5-49 units)
- `373` - Apartment (50+ units)
- `167` - Office Building
- `169` - Shopping Center
- `238` - Light Industrial
- `401` - Vacant Residential Land

**Citation:** knowledge/system-prompt.js:88-91, services/claudeService.js:14-24

**Translation required:** Always convert codes to CRE names before presenting to users.

### Missing/Zero Fields

**Known data gaps:**
1. **`units_count` is 0/NULL for ALL records**
   - Use `area_building` (square footage) as size metric
   - Estimate units: ~900 SF/unit for multifamily

**Citation:** knowledge/system-prompt.js:88

2. **GIS enrichment fields may be NULL:**
   - `zoning_local`, `zoning_jurisdiction`
   - `flood_zone`, `in_floodplain`
   - `nearest_water_ft`, `nearest_sewer_ft`, `nearest_storm_ft`

**Citation:** services/propertyService.js:161-163

### Ownership Sequences

**Pattern: `ownership_sequence = 1` is current owner**
```javascript
WHERE ownership_sequence = 1
ORDER BY ownership_sequence ASC
```
**Citation:** services/propertyService.js:190, services/intelligenceService.js:93

**Sequence values:**
- `1` = Current owner
- `2+` = Previous owners (if present)

---

## 8. GIS Infrastructure

### Unified GIS Table

**Pattern: Single `gis_infrastructure` table with `unified_group` column**

```javascript
const UNIFIED_GROUPS = {
  water: 'water_lines',
  sewer: 'wastewater_lines',
  storm: 'stormwater_lines',
  zoning: 'zoning_districts',
  flood: 'floodplains',
};
```
**Citation:** services/gisService.js:3-9

**Schema:**
- `id` (PK, auto-increment)
- `geom` (PostGIS GEOMETRY, SRID 4326)
- `unified_group` (text: 'water_lines', 'wastewater_lines', etc.)
- `diameter`, `material` (for infrastructure lines)
- `zone_code`, `flood_zone` (for zones/districts)
- `source_server` (ArcGIS REST endpoint URL)
- `attributes` (JSONB: raw attributes from source)

**Citation:** services/gisService.js:23-38

### Attribute Extraction Pattern

**Pattern: Fallback attribute extraction from JSONB**

```javascript
function deriveZoneCode(row) {
  if (row.zone_code) return row.zone_code;
  const attrs = row.attributes || {};
  return attrs.ZONING_ZTYPE || attrs.ZONING_ZTYP || attrs.ZONING ||
         attrs.zone_code || null;
}

function deriveFloodZone(row) {
  if (row.flood_zone) return row.flood_zone;
  const attrs = row.attributes || {};
  return attrs.FLOOD_ZONE || attrs.FLD_ZONE || attrs.FEMA_FLOOD_ZONE ||
         attrs.FloodZone || null;
}
```
**Citation:** services/gisService.js:41-61

**Principle:** Check dedicated column first, then fallback to JSONB `attributes` for variations.

---

## 9. Query Performance Patterns

### Parallel Queries

**Pattern: Promise.all for independent queries**
```javascript
const [dataResult, countResult] = await Promise.all([
  pool.query(sql, params),
  pool.query(countSql, params)
]);
```
**Citation:** services/queryBuilder.js:572-575

**Benefits:**
- Halves latency for queries that need both data and count
- Safe when queries don't depend on each other's results

### Query Result Limits

**Pattern: Hard cap with fallback defaults**
```javascript
const effectiveLimit = Math.min(Math.max(1, limit || 50), 200);
```
**Citation:** services/queryBuilder.js:394

**Limits found:**
- Properties search: 500 default, 2000 max
- GIS features: 15,000 max
- Query builder: 50 default, 200 max
- Comps: 5-20 results

**Citation:** services/propertyService.js:153, services/gisService.js:11, services/queryBuilder.js:394, routes/intelligence.js:64

### Candidate Pre-filtering

**Pattern: CTE for candidate set before expensive joins**
```javascript
WITH candidates AS (
  SELECT p.attom_id
  FROM properties p
  LEFT JOIN foreclosure_records fc ON fc.attom_id = p.attom_id
  WHERE p.fips_code = '48453'
    AND (fc.attom_id IS NOT NULL OR ta.tax_delinquent_year IS NOT NULL)
  LIMIT 5000
)
SELECT ... FROM candidates c
JOIN properties p ON p.attom_id = c.attom_id
-- ... more expensive joins
```
**Citation:** services/intelligenceService.js:823-838

**Principle:** Pre-filter to small candidate set before expensive joins/calculations.

---

## 10. Data Quality & Validation

### Input Validation

**Pattern 1: Bbox parsing with validation**
```javascript
function parseBbox(bboxParam) {
  if (!bboxParam) return null;

  const parts = bboxParam.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) return null;

  const [west, south, east, north] = parts;

  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  if (south < -90 || south > 90 || north < -90 || north > 90) return null;
  if (west > east || south > north) return null;

  return [west, south, east, north];
}
```
**Citation:** routes/gis.js:5-28

**Pattern 2: Registry-based filter validation**
```javascript
function validateFilters(filters) {
  for (const filter of filters) {
    const registryEntry = getFilterBySlug(filter.slug);
    if (!registryEntry) {
      throw new Error(`Unknown filter slug: ${filter.slug}`);
    }

    const allowedOps = ALLOWED_OPERATORS[registryEntry.operator_type];
    if (!allowedOps || !allowedOps.includes(filter.operator)) {
      throw new Error(`Invalid operator "${filter.operator}" for filter "${filter.slug}"`);
    }

    validateValue(filter.slug, filter.operator, filter.value, registryEntry.operator_type);
  }
}
```
**Citation:** services/queryBuilder.js:53-91

### NULL Handling

**Pattern 1: COALESCE for defaults**
```javascript
SUM(COALESCE(job_value, 0))
COUNT(*) AS loan_count  -- COUNT never NULL
```
**Citation:** services/intelligenceService.js:132

**Pattern 2: Explicit NULL checks in CASE**
```javascript
CASE
  WHEN ls.total_loan_balance IS NULL OR ls.total_loan_balance = 0 THEN 'NO_DEBT'
  ELSE 'NORMAL'
END
```
**Citation:** services/intelligenceService.js:233-238

**Pattern 3: NULL-safe comparisons**
```javascript
WHERE (p.in_floodplain = false OR p.in_floodplain IS NULL)
WHERE t.has_homeowner_exemption = false OR t.has_homeowner_exemption IS NULL
```
**Citation:** services/propertyService.js:96

---

## Summary of Data Patterns

### Strengths
1. **100% parameterized queries** - No SQL injection risk
2. **PostGIS optimization** - Proper use of geography types and spatial indexes
3. **CTE-heavy analytics** - Complex derived metrics in single queries
4. **Parallel execution** - Multiple independent queries via Promise.all
5. **Type safety** - Explicit NUMERIC casts, NULL handling

### Variations
1. **Numeric casting** - Mix of explicit `Number()` and relying on JS type coercion
2. **Query building** - Manual param tracking vs. sophisticated builder pattern
3. **Response normalization** - Some services use normalizeRow, others manual mapping

### Known Gaps
1. **No migrations** - Schema managed externally, not in this repo
2. **No explicit indexes** - Inferred from query patterns only
3. **No transaction management** - All queries auto-commit
4. **No query timeout handling** - Relies on pool's connectionTimeout

---

**Last Updated:** 2026-02-20
**Snapshot of:** Main branch, commit b939d44
