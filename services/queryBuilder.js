const pool = require('../db/pool');
const { getFilterBySlug, getJoinClause, getRegistry } = require('./registryService');

// Allowed operators by operator_type
const ALLOWED_OPERATORS = {
  enum: ['eq', 'in', 'not_eq', 'not_in'],
  numeric_range: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  date_range: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'within_days', 'within_months'],
  boolean: ['eq'],
  text_search: ['contains', 'starts_with', 'eq']
};

// Base SELECT columns for property queries
const BASE_SELECT = `
  SELECT p.attom_id, p.address_full, p.address_city, p.address_state,
         p.address_zip, p.latitude, p.longitude,
         p.property_use_standardized, p.property_use_group,
         p.year_built, p.bedrooms_count, p.bath_count,
         p.area_building, p.area_lot_sf, p.area_lot_acres,
         p.tax_assessed_value_total, p.last_sale_date, p.last_sale_price,
         p.zoning, p.flood_zone, p.in_floodplain
  FROM properties p`;

// Known sortable columns from properties table
const KNOWN_COLUMNS = [
  'attom_id', 'address_full', 'address_city', 'address_state', 'address_zip',
  'latitude', 'longitude', 'property_use_standardized', 'property_use_group',
  'year_built', 'bedrooms_count', 'bath_count', 'area_building', 'area_lot_sf',
  'area_lot_acres', 'tax_assessed_value_total', 'last_sale_date', 'last_sale_price',
  'zoning', 'flood_zone', 'in_floodplain'
];

// Table alias mapping for source_table values
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

/**
 * Validates an array of filters against the registry.
 * @param {Array<{slug: string, operator: string, value: any}>} filters
 * @returns {Array<{slug: string, operator: string, value: any, registryEntry: Object}>}
 * @throws {Error} If filter slug unknown, operator invalid, or value invalid
 */
function validateFilters(filters) {
  if (!Array.isArray(filters)) {
    throw new Error('Filters must be an array');
  }

  const validatedFilters = [];

  for (const filter of filters) {
    const { slug, operator, value } = filter;

    // Look up filter in registry
    const registryEntry = getFilterBySlug(slug);
    if (!registryEntry) {
      throw new Error(`Unknown filter slug: ${slug}`);
    }

    const operatorType = registryEntry.operator_type;
    const allowedOps = ALLOWED_OPERATORS[operatorType];

    // Validate operator
    if (!allowedOps || !allowedOps.includes(operator)) {
      throw new Error(
        `Invalid operator "${operator}" for filter "${slug}" (type: ${operatorType})`
      );
    }

    // Validate value based on operator and type
    validateValue(slug, operator, value, operatorType);

    validatedFilters.push({
      slug,
      operator,
      value,
      registryEntry
    });
  }

  return validatedFilters;
}

/**
 * Validates a filter value based on operator and type.
 * @param {string} slug
 * @param {string} operator
 * @param {any} value
 * @param {string} operatorType
 * @throws {Error} If value is invalid
 */
function validateValue(slug, operator, value, operatorType) {
  // "between" requires array of length 2
  if (operator === 'between') {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(
        `Filter "${slug}" with operator "between" requires an array of exactly 2 values`
      );
    }
    return;
  }

  // "in" / "not_in" require array
  if (operator === 'in' || operator === 'not_in') {
    if (!Array.isArray(value)) {
      throw new Error(
        `Filter "${slug}" with operator "${operator}" requires an array value`
      );
    }
    return;
  }

  // Boolean eq requires boolean or coercible value
  if (operatorType === 'boolean' && operator === 'eq') {
    const validBooleans = [true, false, 'true', 'false'];
    if (!validBooleans.includes(value)) {
      throw new Error(
        `Filter "${slug}" requires a boolean value (true, false, "true", or "false")`
      );
    }
    return;
  }

  // Numeric range operators (except between) require a single number
  if (operatorType === 'numeric_range' && operator !== 'between') {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(
        `Filter "${slug}" with operator "${operator}" requires a numeric value`
      );
    }
    return;
  }

  // Date range operators (except between, within_days, within_months) require ISO date string
  if (operatorType === 'date_range') {
    if (operator === 'within_days' || operator === 'within_months') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(
          `Filter "${slug}" with operator "${operator}" requires a positive integer`
        );
      }
      return;
    }

    // For eq, gt, gte, lt, lte on date_range, require ISO date string
    if (operator !== 'between') {
      if (typeof value !== 'string' || isNaN(Date.parse(value))) {
        throw new Error(
          `Filter "${slug}" with operator "${operator}" requires a valid ISO date string`
        );
      }
    }
  }
}

/**
 * Builds spatial WHERE clause.
 * @param {Object|null} spatial - Spatial filter config
 * @param {number} currentParamIdx - Current parameter index
 * @returns {{clause: string|null, newParams: Array, paramCount: number}}
 */
function buildSpatialClause(spatial, currentParamIdx) {
  if (!spatial || !spatial.type) {
    return { clause: null, newParams: [], paramCount: 0 };
  }

  const startIdx = currentParamIdx;

  switch (spatial.type) {
    case 'bbox': {
      // Parse bbox string "minLng,minLat,maxLng,maxLat" into 4 numbers
      const parts = spatial.bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new Error('Invalid bbox format. Expected "minLng,minLat,maxLng,maxLat"');
      }
      const [minLng, minLat, maxLng, maxLat] = parts;
      const clause = `p.longitude BETWEEN $${startIdx} AND $${startIdx + 2} AND p.latitude BETWEEN $${startIdx + 1} AND $${startIdx + 3}`;
      return {
        clause,
        newParams: [minLng, minLat, maxLng, maxLat],
        paramCount: 4
      };
    }

    case 'zip': {
      const clause = `p.address_zip = $${startIdx}`;
      return {
        clause,
        newParams: [spatial.zip],
        paramCount: 1
      };
    }

    case 'radius': {
      if (!spatial.center || typeof spatial.center.lat !== 'number' || typeof spatial.center.lng !== 'number') {
        throw new Error('Radius spatial filter requires center with lat and lng');
      }
      if (typeof spatial.radius !== 'number') {
        throw new Error('Radius spatial filter requires numeric radius in meters');
      }
      const clause = `ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint($${startIdx}, $${startIdx + 1}), 4326)::geography, $${startIdx + 2})`;
      return {
        clause,
        newParams: [spatial.center.lng, spatial.center.lat, spatial.radius],
        paramCount: 3
      };
    }

    case 'polygon': {
      if (!spatial.polygon) {
        throw new Error('Polygon spatial filter requires polygon GeoJSON');
      }
      const clause = `ST_Within(p.location, ST_SetSRID(ST_GeomFromGeoJSON($${startIdx}), 4326))`;
      return {
        clause,
        newParams: [JSON.stringify(spatial.polygon)],
        paramCount: 1
      };
    }

    default:
      throw new Error(`Unknown spatial type: ${spatial.type}`);
  }
}

/**
 * Builds a filter WHERE clause for a single filter.
 * @param {Object} filter - Validated filter with registryEntry
 * @param {number} paramIdx - Current parameter index
 * @returns {{clause: string, params: Array, paramCount: number}}
 */
function buildFilterClause(filter, paramIdx) {
  const { operator, value, registryEntry } = filter;
  const { operator_type, sql_template, source_columns, source_table } = registryEntry;

  // Get the primary source column (first column if array from JSONB)
  const rawColumn = Array.isArray(source_columns) ? source_columns[0] : source_columns;

  // Get table alias and build fully qualified column reference
  const tableAlias = TABLE_ALIASES[source_table] || 'p';
  const sourceColumn = `${tableAlias}.${rawColumn}`;

  let clause;
  let params = [];
  let paramCount = 0;

  // Helper to replace parameter placeholders without chained replacement bug
  // Replace $2 first, then $1, to avoid replacing $1 -> $2 and then $2 -> $3
  function replaceParams(template, startIdx) {
    return template
      .replace(/\$2/g, `$${startIdx + 1}`)
      .replace(/\$1/g, `$${startIdx}`);
  }

  switch (operator) {
    case 'eq':
      if (operator_type === 'boolean') {
        // Handle boolean filters
        const boolValue = value === true || value === 'true';
        // Check if sql_template has hardcoded conditions (no $1 placeholder)
        if (!sql_template.includes('$1')) {
          // Hardcoded template like "IS NOT NULL AND > 0"
          if (boolValue) {
            clause = sql_template;
          } else {
            // Negate: wrap in NOT(...)
            clause = `NOT (${sql_template})`;
          }
          paramCount = 0;
        } else {
          // Simple boolean template with $1 placeholder
          clause = replaceParams(sql_template, paramIdx);
          params = [boolValue];
          paramCount = 1;
        }
      } else if (operator_type === 'enum' || operator_type === 'text_search') {
        // For enum/text with eq, use sql_template if it uses = $1 or ILIKE $1
        if (sql_template && (sql_template.includes('= $1') || sql_template.includes('ILIKE $1'))) {
          clause = replaceParams(sql_template, paramIdx);
          params = [value];
          paramCount = 1;
        } else {
          clause = `${sourceColumn} = $${paramIdx}`;
          params = [value];
          paramCount = 1;
        }
      } else {
        // numeric_range or date_range eq - don't use sql_template
        clause = `${sourceColumn} = $${paramIdx}`;
        params = [value];
        paramCount = 1;
      }
      break;

    case 'in':
      clause = `${sourceColumn} = ANY($${paramIdx}::text[])`;
      params = [value];
      paramCount = 1;
      break;

    case 'not_eq':
      clause = `${sourceColumn} != $${paramIdx}`;
      params = [value];
      paramCount = 1;
      break;

    case 'not_in':
      clause = `NOT (${sourceColumn} = ANY($${paramIdx}::text[]))`;
      params = [value];
      paramCount = 1;
      break;

    case 'gt':
      clause = `${sourceColumn} > $${paramIdx}`;
      params = [value];
      paramCount = 1;
      break;

    case 'gte':
      clause = `${sourceColumn} >= $${paramIdx}`;
      params = [value];
      paramCount = 1;
      break;

    case 'lt':
      clause = `${sourceColumn} < $${paramIdx}`;
      params = [value];
      paramCount = 1;
      break;

    case 'lte':
      clause = `${sourceColumn} <= $${paramIdx}`;
      params = [value];
      paramCount = 1;
      break;

    case 'between':
      clause = `${sourceColumn} BETWEEN $${paramIdx} AND $${paramIdx + 1}`;
      params = [value[0], value[1]];
      paramCount = 2;
      break;

    case 'within_days':
      clause = `${sourceColumn} BETWEEN NOW() AND NOW() + ($${paramIdx} || ' days')::interval`;
      params = [value];
      paramCount = 1;
      break;

    case 'within_months':
      clause = `${sourceColumn} BETWEEN NOW() AND NOW() + ($${paramIdx} || ' months')::interval`;
      params = [value];
      paramCount = 1;
      break;

    case 'contains':
      clause = `${sourceColumn} ILIKE '%' || $${paramIdx} || '%'`;
      params = [value];
      paramCount = 1;
      break;

    case 'starts_with':
      clause = `${sourceColumn} ILIKE $${paramIdx} || '%'`;
      params = [value];
      paramCount = 1;
      break;

    default:
      throw new Error(`Unknown operator: ${operator}`);
  }

  return { clause, params, paramCount };
}

/**
 * Builds SQL query from validated filters, spatial, sort, and limit.
 * @param {Object} options
 * @param {Array} options.filters - Validated filter array from validateFilters()
 * @param {Object|null} options.spatial - Spatial filter config
 * @param {Object|null} options.sort - Sort config { field, order }
 * @param {number} [options.limit=50] - Result limit (max 200)
 * @returns {{sql: string, countSql: string, params: Array}}
 */
function buildQuery({ filters = [], spatial = null, sort = null, limit = 50 }) {
  // Cap limit at 200
  const effectiveLimit = Math.min(Math.max(1, limit || 50), 200);

  // Collect required JOINs (deduplicated by source_table)
  const joinTables = new Set();
  const joinClauses = [];

  for (const filter of filters) {
    const sourceTable = filter.registryEntry.source_table;
    if (sourceTable && sourceTable !== 'properties' && !joinTables.has(sourceTable)) {
      const joinClause = getJoinClause(sourceTable);
      if (joinClause) {
        joinTables.add(sourceTable);
        joinClauses.push(joinClause);
      }
    }
  }

  // Dynamic SELECT columns based on joined tables
  const extraSelects = [];
  if (joinTables.has('current_loans')) {
    extraSelects.push('cl.loan_amount, cl.interest_rate, cl.interest_rate_type, cl.due_date, cl.estimated_balance, cl.lender_name_standardized');
  }
  if (joinTables.has('ownership')) {
    extraSelects.push('o.owner1_name_full, o.company_flag, o.trust_flag, o.is_absentee_owner, o.is_owner_occupied');
  }
  if (joinTables.has('property_valuations')) {
    extraSelects.push('pv.estimated_value, pv.estimated_rental_value, pv.ltv, pv.available_equity, pv.lendable_equity');
  }
  if (joinTables.has('tax_assessments')) {
    extraSelects.push('ta.tax_delinquent_year, ta.tax_amount_billed');
  }
  if (joinTables.has('foreclosure_records')) {
    extraSelects.push('fr.status AS foreclosure_status, fr.auction_date, fr.default_amount');
  }
  if (joinTables.has('climate_risk')) {
    extraSelects.push('cr.total_risk_score');
  }
  if (joinTables.has('building_permits')) {
    extraSelects.push('bp.permit_type, bp.job_value, bp.effective_date AS permit_date');
  }
  if (joinTables.has('property_details')) {
    extraSelects.push('pd.construction_type, pd.quality_grade, pd.condition');
  }

  // Build FROM clause with JOINs
  let fromClause = 'FROM properties p';
  if (joinClauses.length > 0) {
    fromClause += '\n' + joinClauses.join('\n');
  }

  // Start WHERE clause
  const whereParts = ['1=1'];
  const params = [];
  let paramIdx = 1;

  // Add spatial clause
  const spatialResult = buildSpatialClause(spatial, paramIdx);
  if (spatialResult.clause) {
    whereParts.push(spatialResult.clause);
    params.push(...spatialResult.newParams);
    paramIdx += spatialResult.paramCount;
  }

  // Add filter clauses
  for (const filter of filters) {
    const filterResult = buildFilterClause(filter, paramIdx);
    whereParts.push(filterResult.clause);
    params.push(...filterResult.params);
    paramIdx += filterResult.paramCount;
  }

  const whereClause = 'WHERE ' + whereParts.join('\n  AND ');

  // Build ORDER BY clause
  let orderByClause = '';
  if (sort && sort.field) {
    let sortColumn = sort.field;

    // Check if field is a known column
    if (!KNOWN_COLUMNS.includes(sortColumn)) {
      // Try to resolve as filter slug
      const filterEntry = getFilterBySlug(sortColumn);
      if (filterEntry && filterEntry.source_columns) {
        // source_columns is JSONB array, not a string
        const rawColumn = Array.isArray(filterEntry.source_columns)
          ? filterEntry.source_columns[0]
          : filterEntry.source_columns;
        const sourceTable = filterEntry.source_table;
        const tableAlias = TABLE_ALIASES[sourceTable] || 'p';
        sortColumn = `${tableAlias}.${rawColumn}`;

        // Ensure the sort field's table is joined (if not already)
        if (sourceTable && sourceTable !== 'properties' && !joinTables.has(sourceTable)) {
          const joinClause = getJoinClause(sourceTable);
          if (joinClause) {
            joinTables.add(sourceTable);
            joinClauses.push(joinClause);
            // Also add extraSelects for this table
            if (sourceTable === 'current_loans') {
              extraSelects.push('cl.loan_amount, cl.interest_rate, cl.interest_rate_type, cl.due_date, cl.estimated_balance, cl.lender_name_standardized');
            } else if (sourceTable === 'ownership') {
              extraSelects.push('o.owner1_name_full, o.company_flag, o.trust_flag, o.is_absentee_owner, o.is_owner_occupied');
            } else if (sourceTable === 'property_valuations') {
              extraSelects.push('pv.estimated_value, pv.estimated_rental_value, pv.ltv, pv.available_equity, pv.lendable_equity');
            } else if (sourceTable === 'tax_assessments') {
              extraSelects.push('ta.tax_delinquent_year, ta.tax_amount_billed');
            } else if (sourceTable === 'foreclosure_records') {
              extraSelects.push('fr.status AS foreclosure_status, fr.auction_date, fr.default_amount');
            } else if (sourceTable === 'climate_risk') {
              extraSelects.push('cr.total_risk_score');
            } else if (sourceTable === 'building_permits') {
              extraSelects.push('bp.permit_type, bp.job_value, bp.effective_date AS permit_date');
            } else if (sourceTable === 'property_details') {
              extraSelects.push('pd.construction_type, pd.quality_grade, pd.condition');
            }
          }
        }
      } else {
        // Default to properties table prefix
        sortColumn = `p.${sort.field}`;
      }
    } else {
      sortColumn = `p.${sortColumn}`;
    }

    const sortOrder = sort.order === 'asc' ? 'ASC' : 'DESC';
    orderByClause = `ORDER BY ${sortColumn} ${sortOrder}`;
  }

  // Rebuild FROM clause in case ORDER BY added new JOINs
  fromClause = 'FROM properties p';
  if (joinClauses.length > 0) {
    fromClause += '\n' + joinClauses.join('\n');
  }

  // Build LIMIT clause
  const limitClause = `LIMIT ${effectiveLimit}`;

  // Assemble main query
  let selectClause = `
  SELECT p.attom_id, p.address_full, p.address_city, p.address_state,
         p.address_zip, p.latitude, p.longitude,
         p.property_use_standardized, p.property_use_group,
         p.year_built, p.bedrooms_count, p.bath_count,
         p.area_building, p.area_lot_sf, p.area_lot_acres,
         p.tax_assessed_value_total, p.last_sale_date, p.last_sale_price,
         p.zoning, p.flood_zone, p.in_floodplain`;
  if (extraSelects.length > 0) {
    selectClause += ',\n           ' + extraSelects.join(',\n           ');
  }

  const sql = [
    selectClause,
    fromClause,
    whereClause,
    orderByClause,
    limitClause
  ].filter(Boolean).join('\n');

  // Assemble count query (no ORDER BY, no LIMIT)
  const countSql = [
    'SELECT COUNT(*) as total_count',
    fromClause,
    whereClause
  ].join('\n');

  return { sql, countSql, params };
}

/**
 * Executes SQL and count queries in parallel.
 * @param {Object} options
 * @param {string} options.sql - Main query SQL
 * @param {string} options.countSql - Count query SQL
 * @param {Array} options.params - Query parameters
 * @returns {Promise<{properties: Array, totalCount: number}>}
 */
async function executeQuery({ sql, countSql, params }) {
  const [dataResult, countResult] = await Promise.all([
    pool.query(sql, params),
    pool.query(countSql, params)
  ]);

  return {
    properties: dataResult.rows,
    totalCount: parseInt(countResult.rows[0].total_count, 10)
  };
}

/**
 * Runs insight queries to count how many properties in a set match certain filter conditions.
 * @param {Array<number>} attomIds - Array of attom_id values to check
 * @param {Array<string>} insightSlugs - Array of filter slugs to check
 * @returns {Promise<Array<{slug: string, filterName: string, count: number, total: number}>>}
 */
async function runInsightQueries(attomIds, insightSlugs) {
  if (!attomIds || attomIds.length === 0 || !insightSlugs || insightSlugs.length === 0) {
    return [];
  }

  const insights = [];

  for (const slug of insightSlugs) {
    const filter = getFilterBySlug(slug);
    if (!filter) {
      continue;
    }

    const { operator_type, source_table, sql_template, source_columns } = filter;

    // Skip numeric filters - these need thresholds and are better handled by Layer 4
    if (operator_type === 'numeric_range') {
      continue;
    }

    // Get join clause if needed
    let joinClause = '';
    if (source_table && source_table !== 'properties') {
      const join = getJoinClause(source_table);
      if (join) {
        joinClause = join;
      }
    }

    let countQuery;

    if (operator_type === 'boolean') {
      // For boolean filters, count where the condition is true
      // Check if sql_template has hardcoded conditions (no $1 placeholder)
      if (!sql_template.includes('$1')) {
        countQuery = `
          SELECT COUNT(*) as count
          FROM properties p
          ${joinClause}
          WHERE p.attom_id = ANY($1::bigint[])
            AND ${sql_template}
        `;
      } else {
        // Simple boolean template with $1 placeholder
        const condition = sql_template.replace('$1', 'true');
        countQuery = `
          SELECT COUNT(*) as count
          FROM properties p
          ${joinClause}
          WHERE p.attom_id = ANY($1::bigint[])
            AND ${condition}
        `;
      }
    } else if (operator_type === 'date_range') {
      // For date filters, count within next 12 months
      const sourceColumn = Array.isArray(source_columns) ? source_columns[0] : source_columns;
      if (!sourceColumn) {
        continue;
      }
      countQuery = `
        SELECT COUNT(*) as count
        FROM properties p
        ${joinClause}
        WHERE p.attom_id = ANY($1::bigint[])
          AND ${sourceColumn} BETWEEN NOW() AND NOW() + INTERVAL '12 months'
      `;
    } else {
      // Skip other types for insights
      continue;
    }

    try {
      const result = await pool.query(countQuery, [attomIds]);
      insights.push({
        slug,
        filterName: filter.filter_name,
        count: parseInt(result.rows[0].count, 10),
        total: attomIds.length
      });
    } catch (error) {
      console.error(`[queryBuilder] Error running insight query for ${slug}:`, error.message);
      // Skip this insight on error
    }
  }

  return insights;
}

/**
 * High-level orchestrator: validates filters, builds SQL, executes, runs insights.
 * Entry point for Layer 2 → Layer 3.
 */
async function executeSearch({ filters = [], spatial = null, sort = null, limit = 25, insights_to_check = [] }) {
  const validatedFilters = validateFilters(filters);

  const { sql, countSql, params } = buildQuery({
    filters: validatedFilters,
    spatial,
    sort,
    limit,
  });

  console.log('[queryBuilder] SQL:', sql.substring(0, 200) + '...');
  console.log('[queryBuilder] Params:', JSON.stringify(params));

  const { properties, totalCount } = await executeQuery({ sql, countSql, params });

  const attomIds = properties.map(p => p.attom_id);
  const insights = await runInsightQueries(attomIds, insights_to_check);

  return {
    properties,
    total_count: totalCount,
    applied_filters: validatedFilters.map(f => ({
      slug: f.slug,
      name: f.registryEntry.filter_name,
      category: f.registryEntry.category,
      operator: f.operator,
      value: f.value,
    })),
    insights: insights.map(i => ({
      slug: i.slug,
      label: i.filterName,
      count: i.count,
      total: i.total,
    })),
  };
}

module.exports = {
  validateFilters,
  buildQuery,
  buildSpatialClause,
  executeQuery,
  executeSearch,
  runInsightQueries
};
