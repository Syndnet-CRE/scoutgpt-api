# ScoutGPT Backend Style Guide

**What IS, not what SHOULD BE**

This guide documents the actual patterns found in the codebase as of 2026-02-20.

---

## 1. File Structure

### Directory Organization
```
scoutgpt-api/
├── server.js              # Entry point
├── routes/                # Express route handlers
├── services/              # Business logic layer
├── utils/                 # Shared utilities
├── db/                    # Database connection
└── knowledge/             # AI prompts and domain knowledge
    ├── prompts/           # Prompt templates
    └── archived/          # Legacy code
```

**Citation:** Root directory structure

### Naming Conventions

- **Routes:** Kebab-case filenames, match endpoint resource names
  - `routes/properties.js` → `/api/properties`
  - `routes/gis.js` → `/api/gis`
  - **Citation:** routes/properties.js:1, routes/gis.js:1

- **Services:** camelCase, descriptive function names
  - `propertyService.js`, `claudeService.js`, `gisService.js`
  - **Citation:** services/propertyService.js:1, services/claudeService.js:1

- **Functions:** camelCase
  - `searchProperties()`, `getPropertyDetail()`, `parseBbox()`
  - **Citation:** services/propertyService.js:13, utils/normalize.js:19

---

## 2. API Route Patterns

### Route Handler Structure

**Pattern 1: Express router with imported service**
```javascript
const express = require('express');
const router = express.Router();
const serviceName = require('../services/serviceName');

router.get('/', async (req, res) => {
  try {
    // Extract and parse query params
    // Call service layer
    // Return JSON response
  } catch (error) {
    console.error('Error message:', error);
    res.status(500).json({ error: 'Message', details: error.message });
  }
});

module.exports = router;
```
**Citation:** routes/properties.js:1-32, routes/health.js:1-26

**Pattern 2: Helper function for DRY route handlers**
```javascript
async function handleGisRequest(req, res, layerType) {
  const bbox = parseBbox(req.query.bbox);
  if (!bbox) {
    return res.status(400).json({
      error: 'Invalid bbox parameter',
      expected: 'bbox=west,south,east,north (e.g., bbox=-97.8,30.2,-97.7,30.3)',
    });
  }
  // ... processing
}

router.get('/water', (req, res) => handleGisRequest(req, res, 'water'));
router.get('/sewer', (req, res) => handleGisRequest(req, res, 'sewer'));
```
**Citation:** routes/gis.js:30-54

### Query Parameter Parsing

**Pattern 1: Destructure from req.query**
```javascript
const { bbox: bboxStr, limit, ...filterParams } = req.query;
```
**Citation:** routes/properties.js:8

**Pattern 2: Parse with validation**
```javascript
const options = {
  radiusMiles: parseFloat(req.query.radius) || 3,
  monthsBack: parseInt(req.query.months) || 24,
  limit: Math.min(parseInt(req.query.limit) || 5, 20),
};
```
**Citation:** routes/intelligence.js:61-67

**Pattern 3: Boolean filter detection**
```javascript
const booleanFilters = ['absenteeOwner', 'ownerOccupied', 'corporateOwned'];
for (const key of booleanFilters) {
  if (filterParams[key] === 'true') filters[key] = true;
}
```
**Citation:** routes/properties.js:13-16

### Response Envelope Patterns

**Pattern 1: Success with count**
```javascript
res.json({ count: properties.length, properties });
```
**Citation:** routes/properties.js:25

**Pattern 2: Direct object/array return**
```javascript
res.json(intelligence);  // Single object
res.json(comps);         // Array of objects
```
**Citation:** routes/intelligence.js:42, routes/intelligence.js:70

**Pattern 3: Structured envelope with metadata**
```javascript
res.json({
  owners,
  count: owners.length
});
```
**Citation:** routes/intelligence.js:109

**Variation found:** Not all endpoints use a consistent success/data/error envelope. Some return direct data, others wrap in count/properties.

### Error Handling

**Pattern 1: Try/catch with status codes**
```javascript
router.get('/', async (req, res) => {
  try {
    // ... logic
  } catch (error) {
    console.error('Error searching properties:', error);
    res.status(500).json({ error: 'Failed to search properties', details: error.message });
  }
});
```
**Citation:** routes/properties.js:26-29

**Pattern 2: Early return validation**
```javascript
if (!attomId || isNaN(attomId)) {
  return res.status(400).json({ error: 'Valid attomId required' });
}
```
**Citation:** routes/intelligence.js:33-35

**Pattern 3: 404 for missing resources**
```javascript
if (!intelligence) {
  return res.status(404).json({ error: 'Property not found' });
}
```
**Citation:** routes/intelligence.js:38-40

### Middleware Chain

**Pattern: Global middleware in server.js**
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});
```
**Citation:** server.js:10-24

**No per-route middleware found in current codebase.**

### Route Registration

**Pattern: Mount at /api prefix in server.js**
```javascript
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
**Citation:** server.js:26-34

**Note:** Order matters - `/api/properties/filter` registered before `/api/properties`

---

## 3. Service Layer Patterns

### Service Module Structure

**Pattern 1: Service exports multiple related functions**
```javascript
async function searchProperties({ bbox, filters = {}, limit = 500 }) { /* ... */ }
async function getPropertyDetail(attomId) { /* ... */ }
async function getMarketStats({ zipCode, fipsCode, propertyType }) { /* ... */ }

module.exports = { searchProperties, getPropertyDetail, getMarketStats };
```
**Citation:** services/propertyService.js:260

**Pattern 2: Service with constants exported**
```javascript
const UNIFIED_GROUPS = {
  water: 'water_lines',
  sewer: 'wastewater_lines',
  // ...
};

async function getGisLayer(layerType, bbox) { /* ... */ }

module.exports = {
  getGisLayer,
  UNIFIED_GROUPS,
};
```
**Citation:** services/gisService.js:140-143

### Parameter Destructuring

**Pattern: Named parameters with defaults**
```javascript
async function searchProperties({ bbox, filters = {}, limit = 500 }) {
  // ...
}

async function getComparableSales(attomId, options = {}) {
  const {
    radiusMiles = 3,
    sfTolerance = 0.3,
    yearTolerance = 15,
    monthsBack = 24,
    limit = 10
  } = options;
  // ...
}
```
**Citation:** services/propertyService.js:13, services/intelligenceService.js:569-576

### Constants

**Pattern 1: Top-of-file mapping constants**
```javascript
const ZONING_CATEGORY_MAP = {
  residential: ['SF-1','SF-2','SF-3','SF-4A','SF-4B','SF-5','SF-6','MF-1','MF-2','MF-3','MF-4','MF-5','MF-6','MH','RR','LA','R-1','R-2','R-3'],
  commercial: ['GR','CR','CS','CS-1','CH','LR','NO','W/LO','CBD','C-1','C-2','C-3'],
  industrial: ['LI','MI','IP','W/LO-I','I-1','I-2'],
  mixed_use: ['DMU','MU','PUD','TOD','VMU','V'],
  agricultural: ['AG','DR'],
};
```
**Citation:** services/propertyService.js:5-11

**Pattern 2: Table alias mapping**
```javascript
const TABLE_ALIASES = {
  properties: 'p',
  ownership: 'o',
  tax_assessments: 'ta',
  current_loans: 'cl',
  property_valuations: 'pv',
  sales_transactions: 'st',
  property_details: 'pd',
  foreclosure_records: 'fr',
  climate_risk: 'cr',
  building_permits: 'bp'
};
```
**Citation:** services/queryBuilder.js:34-45

**Pattern 3: Allowed operators by type**
```javascript
const ALLOWED_OPERATORS = {
  enum: ['eq', 'in', 'not_eq', 'not_in'],
  numeric_range: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  date_range: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'within_days', 'within_months'],
  boolean: ['eq'],
  text_search: ['contains', 'starts_with', 'eq']
};
```
**Citation:** services/queryBuilder.js:5-11

---

## 4. Database Patterns

### Connection Pool

**Pattern: Singleton pool in db/pool.js**
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

pool.query('SELECT NOW()')
  .then(() => console.log('Connected to Neon PostgreSQL'))
  .catch((err) => console.error('Database connection failed:', err.message));

module.exports = pool;
```
**Citation:** db/pool.js:1-19

**Usage:**
```javascript
const pool = require('../db/pool');
const result = await pool.query(query, params);
```
**Citation:** services/propertyService.js:1, services/propertyService.js:170

### Query Building

**Pattern 1: Parameterized queries with manual param index tracking**
```javascript
const params = [];
const conditions = [];
let paramIndex = 1;

if (bbox) {
  conditions.push(`p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`);
  params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
  paramIndex += 4;
}

if (filters.minAcres) {
  conditions.push(`p.area_lot_acres >= $${paramIndex}`);
  params.push(filters.minAcres);
  paramIndex++;
}
```
**Citation:** services/propertyService.js:14-49

**Pattern 2: Template literal injection for safe numeric constants**
```javascript
// Pre-compute numeric values to inject via template literals (safe - all from validated defaults)
const minPropsNum = Number(minProperties);
const limitNum = Number(limit);

const query = `
  SELECT ...
  HAVING COUNT(DISTINCT o.attom_id) >= ${minPropsNum}
  ORDER BY property_count DESC
  LIMIT ${limitNum};
`;
```
**Citation:** services/intelligenceService.js:757-783

**CRITICAL:** Template literal injection only used for validated numeric constants, never user input.

**Pattern 3: Dynamic WHERE clause building**
```javascript
const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

const query = `
  SELECT ...
  FROM properties p
  ${whereClause}
  LIMIT $${paramIndex}
`;
```
**Citation:** services/propertyService.js:134-168

### PostGIS Spatial Queries

**Pattern 1: ST_MakeEnvelope for bounding box**
```javascript
conditions.push(`p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`);
params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
```
**Citation:** services/propertyService.js:19-20

**Pattern 2: ST_DWithin for radius queries**
```javascript
ST_DWithin(p2.location::geography, s.location::geography, ${radiusMeters})
```
**Citation:** services/intelligenceService.js:620

**Pattern 3: ST_Intersects for geometry overlaps**
```javascript
WHERE ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
```
**Citation:** services/gisService.js:33

**Pattern 4: ST_AsGeoJSON for output**
```javascript
SELECT
  id,
  ST_AsGeoJSON(geom)::json as geometry,
  diameter,
  material
FROM gis_infrastructure
```
**Citation:** services/gisService.js:23-26

**Pattern 5: ST_Distance for comparables**
```javascript
ROUND((ST_Distance(p2.location::geography, s.location::geography) / 1609.34)::numeric, 2) AS distance_miles
```
**Citation:** services/intelligenceService.js:611

### CTEs (Common Table Expressions)

**Pattern: Multiple CTEs for complex aggregations**
```javascript
const query = `
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
`;
```
**Citation:** services/intelligenceService.js:36-431 (full CTE example)

### Parallel Queries

**Pattern: Promise.all for independent queries**
```javascript
const [propertyResult, ownershipResult, taxResult, salesResult, loansResult, valuationsResult, climateResult, permitsResult, foreclosureResult] = await Promise.all([
  pool.query(`SELECT p.*, pd.* FROM properties p LEFT JOIN property_details pd ON pd.attom_id = p.attom_id WHERE p.attom_id = $1`, [attomId]),
  pool.query(`SELECT * FROM ownership WHERE attom_id = $1 ORDER BY ownership_sequence ASC`, [attomId]),
  pool.query(`SELECT * FROM tax_assessments WHERE attom_id = $1 ORDER BY tax_year DESC LIMIT 5`, [attomId]),
  pool.query(`SELECT st.* FROM sales_transactions st WHERE st.attom_id = $1 ORDER BY st.recording_date DESC LIMIT 10`, [attomId]),
  pool.query(`SELECT * FROM current_loans WHERE attom_id = $1 ORDER BY loan_position ASC`, [attomId]),
  pool.query(`SELECT * FROM property_valuations WHERE attom_id = $1 ORDER BY valuation_date DESC LIMIT 5`, [attomId]),
  pool.query(`SELECT * FROM climate_risk WHERE attom_id = $1`, [attomId]),
  pool.query(`SELECT * FROM building_permits WHERE attom_id = $1 ORDER BY effective_date DESC LIMIT 20`, [attomId]),
  pool.query(`SELECT * FROM foreclosure_records WHERE attom_id = $1 ORDER BY foreclosure_recording_date DESC`, [attomId]),
]);
```
**Citation:** services/propertyService.js:175-198

---

## 5. AI/Claude Integration Patterns

### Tool Definitions

**Pattern: Array of tool definition objects**
```javascript
const tools = [
  {
    name: 'search_properties',
    description: `Search for properties...`,
    input_schema: {
      type: 'object',
      properties: {
        bbox: { type: 'string', description: 'Bounding box as "minLng,minLat,maxLng,maxLat"' },
        zipCode: { type: 'string', description: 'ZIP code (e.g., "78701")' },
        propertyType: { type: 'string', description: 'ATTOM numeric codes, comma-separated' },
        limit: { type: 'number', description: 'Number of results to return' },
      },
    },
  },
  {
    name: 'get_property_details',
    description: 'Get full property details by attom_id OR by address search',
    input_schema: {
      type: 'object',
      properties: {
        attomId: { type: 'string', description: 'ATTOM property ID' },
        address: { type: 'string', description: 'Street address to search for' },
      },
    },
  },
];
```
**Citation:** services/claudeService.js:9-78

### Tool Execution

**Pattern: Switch statement tool router**
```javascript
async function executeTool(toolName, toolInput) {
  console.log(`[TOOL] ${toolName} called with:`, JSON.stringify(toolInput));

  switch (toolName) {
    case 'search_properties': {
      const bbox = toolInput.bbox ? parseBbox(toolInput.bbox) : null;
      const filters = { ...toolInput }; delete filters.bbox; delete filters.limit;
      const result = await propertyService.searchProperties({ bbox, filters, limit: toolInput.limit || 15 });
      return result;
    }
    case 'get_property_details': {
      return await propertyService.getPropertyDetail(toolInput.attomId);
    }
    case 'get_market_stats':
      return await propertyService.getMarketStats(toolInput);
    case 'spatial_query':
      return await spatialService.propertiesWithinRadius(toolInput.longitude, toolInput.latitude, toolInput.radiusMeters || 1000, toolInput.limit || 50);
    default:
      return { error: 'Unknown tool: ' + toolName };
  }
}
```
**Citation:** services/claudeService.js:81-119

### System Prompt Building

**Pattern: Function that generates prompt from context**
```javascript
function buildSystemPrompt(context = {}) {
  const codeGroups = buildCodeGroupReference();
  const distressRef = buildDistressReference();
  const scoreLabels = buildScoreLabels();

  return `You are ScoutGPT, a commercial real estate (CRE) intelligence analyst...

## DATABASE SCHEMA
...

## TOOL USAGE
...
`;
}

module.exports = { buildSystemPrompt };
```
**Citation:** knowledge/system-prompt.js:60-100

### Agentic Loop

**Pattern: While loop with iteration limit**
```javascript
let response = await callClaudeAPI(apiKey, systemPrompt, messages, tools);
let iterations = 0;

while (response.stop_reason === 'tool_use' && iterations < 3) {
  iterations++;
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
  const toolResults = [];

  for (const tu of toolUseBlocks) {
    try {
      const result = await executeTool(tu.name, tu.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    } catch (error) {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify({ error: error.message }),
        is_error: true,
      });
    }
  }

  const updatedMessages = [
    ...messages,
    { role: 'assistant', content: response.content },
    { role: 'user', content: toolResults },
  ];
  response = await callClaudeAPI(apiKey, systemPrompt, updatedMessages, tools);
}
```
**Citation:** services/claudeService.js:147-207

### Rate Limiting

**Pattern: Check 429 status and return user-friendly message**
```javascript
if (response.status === 429) {
  console.log('[CLAUDE] Rate limited — returning friendly message');
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: "I'm processing a lot of data right now. Please wait about 30 seconds and try your query again." }],
  };
}
```
**Citation:** services/claudeService.js:230-236

### Intent Classification

**Pattern: Layer 1 fast intent router with Haiku**
```javascript
const intentResult = await classifyIntent(userText, {
  selectedProperty: context?.selectedProperty || null,
  bbox: context?.bbox || null,
});

console.log(`[INTENT_ROUTER] "${userText.substring(0, 60)}..." → ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(0)}%) — ${intentResult.reasoning}`);

if (intentResult.intent === 'general_chat') {
  const chatResponse = await generateGeneralChatResponse(userText, context);
  return res.json({
    text: chatResponse.text,
    properties: [],
    propertyMarkers: [],
    intent: 'general_chat',
  });
}
```
**Citation:** routes/chat.js:24-40

---

## 6. Error Handling & Logging

### Console Logging

**Pattern 1: Prefixed log messages**
```javascript
console.log(`[TOOL] ${toolName} called with:`, JSON.stringify(toolInput));
console.log(`[SEARCH] Filters:`, JSON.stringify(filters));
console.log(`[SEARCH] Returned ${count} results`);
```
**Citation:** services/claudeService.js:82, services/claudeService.js:88, services/claudeService.js:91

**Pattern 2: Error logging with context**
```javascript
console.error('[Intelligence] Error:', err.message);
console.error('[Comps] Error:', err.message);
console.error('[INTELLIGENCE] Comps query error:', error.message);
```
**Citation:** routes/intelligence.js:44, routes/intelligence.js:72, services/intelligenceService.js:648

**Pattern 3: Startup/lifecycle logging**
```javascript
pool.query('SELECT NOW()')
  .then(() => console.log('Connected to Neon PostgreSQL'))
  .catch((err) => console.error('Database connection failed:', err.message));
```
**Citation:** db/pool.js:15-17

### Try/Catch Patterns

**Pattern 1: Route-level try/catch**
```javascript
router.get('/', async (req, res) => {
  try {
    // ... business logic
    res.json(result);
  } catch (error) {
    console.error('Error searching properties:', error);
    res.status(500).json({ error: 'Failed to search properties', details: error.message });
  }
});
```
**Citation:** routes/properties.js:6-29

**Pattern 2: Service-level try/catch with fallback**
```javascript
try {
  const { rows } = await pool.query(query, [attomId, limit]);
  return rows;
} catch (error) {
  console.error('[INTELLIGENCE] Comps query error:', error.message);
  return [];
}
```
**Citation:** services/intelligenceService.js:644-650

**Pattern 3: Tool execution error handling**
```javascript
for (const tu of toolUseBlocks) {
  try {
    const result = await executeTool(tu.name, tu.input);
    toolResults.push({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    toolResults.push({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: JSON.stringify({ error: error.message }),
      is_error: true,
    });
  }
}
```
**Citation:** services/claudeService.js:155-198

### Global Error Handlers

**Pattern: Global error middleware in server.js**
```javascript
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});
```
**Citation:** server.js:36-43

---

## 7. Data Normalization

### snake_case to camelCase Conversion

**Pattern: Utility functions for row normalization**
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
```javascript
const { normalizeRow, normalizeRows } = require('../utils/normalize');

const property = normalizeRow(propertyResult.rows[0]);
const sales = normalizeRows(salesResult.rows);
```
**Citation:** services/propertyService.js:2, services/propertyService.js:216

### Manual camelCase Mapping

**Pattern: Explicit property mapping for complex objects**
```javascript
return {
  attomId: row.attom_id,
  addressFull: row.address_full,
  propertyUse: row.property_use_standardized,
  yearBuilt: row.year_built,

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

### Numeric Casting

**Pattern: Cast PostgreSQL NUMERIC to Number**
```javascript
const numericGisFields = ['nearestWaterFt', 'nearestWaterDiam', 'nearestSewerFt'];
for (const field of numericGisFields) {
  if (property[field] != null) property[field] = Number(property[field]);
}
```
**Citation:** services/propertyService.js:220-223

---

## 8. Environment Variables

**Pattern: dotenv at entry point**
```javascript
require('dotenv').config();

const express = require('express');
// ...
const PORT = process.env.PORT || 3001;
```
**Citation:** server.js:1, server.js:8

**Usage throughout codebase:**
```javascript
process.env.DATABASE_URL
process.env.CORS_ORIGIN
process.env.ANTHROPIC_API_KEY
```
**Citation:** db/pool.js:4, server.js:11, services/claudeService.js:122

---

## 9. Module Exports

**Pattern 1: Multiple named exports**
```javascript
module.exports = {
  searchProperties,
  getPropertyDetail,
  getMarketStats
};
```
**Citation:** services/propertyService.js:260

**Pattern 2: Single default export**
```javascript
module.exports = router;
```
**Citation:** routes/properties.js:32

**Pattern 3: Mixed exports (functions + constants)**
```javascript
module.exports = {
  getGisLayer,
  UNIFIED_GROUPS,
};
```
**Citation:** services/gisService.js:140-143

---

## 10. Comments & Documentation

### File Headers

**Pattern 1: Block comment header with deployment instructions**
```javascript
// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — CRE Intelligence Routes
// File: routes/intelligence.js
//
// Drop into ~/scoutgpt-api/routes/
// Wire into server.js:  app.use('/api', require('./routes/intelligence'));
//
// NEW ENDPOINTS:
//   GET  /api/property/:attomId/intelligence   — Full derived metrics + scores
//   GET  /api/property/:attomId/comps          — Comparable sales (PostGIS spatial)
// ══════════════════════════════════════════════════════════════
```
**Citation:** routes/intelligence.js:1-14

**Pattern 2: JSDoc-style function header**
```javascript
/**
 * ScoutGPT CRE System Prompt Generator
 *
 * Generates the system prompt that transforms Claude from a generic
 * database query bot into a CRE-intelligent analyst.
 *
 * Usage in claudeService.js:
 *   const { buildSystemPrompt } = require('../knowledge/system-prompt');
 *   const systemPrompt = buildSystemPrompt(context);
 */
```
**Citation:** knowledge/system-prompt.js:1-14

### Inline Comments

**Pattern 1: Section dividers**
```javascript
// ──────────────────────────────────────────────────────────────
// GET /api/property/:attomId/intelligence
// Returns all 15 derived metrics + 3 composite scores for a property
// ──────────────────────────────────────────────────────────────
```
**Citation:** routes/intelligence.js:26-29

**Pattern 2: Inline clarifications**
```javascript
// Default to Travis County area when no bbox provided
const bbox = parseBbox(bboxStr) || parseBbox('-98.0,30.1,-97.5,30.5');
```
**Citation:** routes/properties.js:10

**Pattern 3: SQL comment headers**
```javascript
// ═══ DERIVED METRIC 1: Estimated Equity Position ═══
// ═══ COMPOSITE: Distress Score (0-100) ═══
```
**Citation:** services/intelligenceService.js:184, services/intelligenceService.js:326

**Variation found:** Comment style varies between routes (minimal) and services (heavily documented).

---

## Summary of Variations & Inconsistencies

1. **Response Envelopes:** No unified envelope pattern - some endpoints return direct objects/arrays, others wrap in `{ count, properties }`, others in `{ owners, count }`.

2. **Error Messages:** User-facing error messages vary in tone and detail level.

3. **Comment Density:** Routes are minimally commented, services/intelligence code is heavily documented with ASCII art section dividers.

4. **Query Building:** Mix of manual parameterization (propertyService) and more sophisticated builder pattern (queryBuilder).

5. **Logging Prefixes:** Inconsistent use of `[UPPERCASE]` vs `[PascalCase]` in log prefixes.

6. **Module Imports:** All use CommonJS (`require`/`module.exports`), no ESM found.

---

**Last Updated:** 2026-02-20
**Snapshot of:** Main branch, commit b939d44
