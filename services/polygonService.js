// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Polygon Query Service
// File: services/polygonService.js
//
// Queries properties within a GeoJSON polygon with optional filters.
// Returns properties + summary statistics for the selection panel.
// ══════════════════════════════════════════════════════════════

const pool = require('../db/pool');
const {
  buildAssetClassCondition,
  buildOwnerTypeCondition,
  buildForeclosureTypeCondition,
} = require('../utils/filterMappings');

/**
 * Query properties within a GeoJSON polygon
 * @param {Object} polygon - GeoJSON Polygon object
 * @param {Object} filters - Optional filter criteria
 * @param {number} limit - Max results (default 5000)
 * @returns {Object} { properties, count, summary }
 */
async function queryPropertiesInPolygon(polygon, filters = {}, limit = 5000) {
  const params = [];
  let paramIndex = 1;

  // Build conditions array
  const conditions = [];
  const joins = {
    ownership: false,
    salesTransactions: false,
    propertyValuations: false,
    foreclosureRecords: false,
  };

  // ═══════════════════════════════════════════════════════════
  // POLYGON INTERSECTION (Required)
  // ═══════════════════════════════════════════════════════════
  conditions.push(`ST_Intersects(p.location, ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}), 4326))`);
  params.push(JSON.stringify(polygon));
  paramIndex++;

  // ═══════════════════════════════════════════════════════════
  // PROPERTY FILTERS
  // ═══════════════════════════════════════════════════════════

  // Asset Class
  if (filters.assetClass && filters.assetClass.length > 0) {
    const assetCondition = buildAssetClassCondition(filters.assetClass);
    if (assetCondition) {
      conditions.push(assetCondition);
    }
  }

  // Lot Size (acres)
  if (filters.lotSizeMin != null) {
    conditions.push(`p.area_lot_acres >= $${paramIndex}`);
    params.push(filters.lotSizeMin);
    paramIndex++;
  }
  if (filters.lotSizeMax != null) {
    conditions.push(`p.area_lot_acres <= $${paramIndex}`);
    params.push(filters.lotSizeMax);
    paramIndex++;
  }

  // Building Size (sqft)
  if (filters.buildingSizeMin != null) {
    conditions.push(`p.area_building >= $${paramIndex}`);
    params.push(filters.buildingSizeMin);
    paramIndex++;
  }
  if (filters.buildingSizeMax != null) {
    conditions.push(`p.area_building <= $${paramIndex}`);
    params.push(filters.buildingSizeMax);
    paramIndex++;
  }

  // Year Built
  if (filters.yearBuiltMin != null) {
    conditions.push(`p.year_built >= $${paramIndex}`);
    params.push(filters.yearBuiltMin);
    paramIndex++;
  }
  if (filters.yearBuiltMax != null) {
    conditions.push(`p.year_built <= $${paramIndex}`);
    params.push(filters.yearBuiltMax);
    paramIndex++;
  }

  // Sale Price
  if (filters.salePriceMin != null) {
    conditions.push(`p.last_sale_price >= $${paramIndex}`);
    params.push(filters.salePriceMin);
    paramIndex++;
  }
  if (filters.salePriceMax != null) {
    conditions.push(`p.last_sale_price <= $${paramIndex}`);
    params.push(filters.salePriceMax);
    paramIndex++;
  }

  // ═══════════════════════════════════════════════════════════
  // OWNERSHIP FILTERS
  // ═══════════════════════════════════════════════════════════

  // Owner Type
  if (filters.ownerType && filters.ownerType.length > 0) {
    joins.ownership = true;
    const ownerCondition = buildOwnerTypeCondition(filters.ownerType);
    if (ownerCondition) {
      conditions.push(ownerCondition);
    }
  }

  // Absentee Only
  if (filters.absenteeOnly) {
    joins.ownership = true;
    conditions.push('o.is_absentee_owner = true');
  }

  // ═══════════════════════════════════════════════════════════
  // RISK FILTERS
  // ═══════════════════════════════════════════════════════════

  // Has Foreclosure
  if (filters.hasForeclosure) {
    joins.foreclosureRecords = true;
    conditions.push('fr.attom_id IS NOT NULL');
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD QUERY
  // ═══════════════════════════════════════════════════════════

  let joinClauses = '';
  if (joins.ownership) {
    joinClauses += '\n  LEFT JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1';
  }
  if (joins.foreclosureRecords) {
    joinClauses += '\n  LEFT JOIN foreclosure_records fr ON fr.attom_id = p.attom_id';
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Main query for properties
  const mainQuery = `
    SELECT
      p.attom_id,
      p.address_full,
      p.address_city,
      p.address_zip,
      p.latitude,
      p.longitude,
      p.property_use_standardized,
      p.property_use_group,
      p.year_built,
      p.area_building,
      p.area_lot_acres,
      p.tax_assessed_value_total,
      p.last_sale_date,
      p.last_sale_price
    FROM properties p
    ${joinClauses}
    ${whereClause}
    LIMIT $${paramIndex}
  `;
  params.push(Math.min(limit, 5000));

  // Summary query (aggregates)
  const summaryQuery = `
    SELECT
      COUNT(*) as total_count,
      SUM(p.tax_assessed_value_total) as total_value,
      AVG(p.tax_assessed_value_total) as avg_value,
      AVG(p.area_lot_acres) as avg_lot_acres,
      AVG(p.area_building) as avg_building_sqft
    FROM properties p
    ${joinClauses}
    ${whereClause.replace(`LIMIT $${paramIndex}`, '')}
  `;

  // Property type counts query
  const typeCountsQuery = `
    SELECT
      p.property_use_standardized as code,
      COUNT(*) as count
    FROM properties p
    ${joinClauses}
    ${whereClause.replace(`LIMIT $${paramIndex}`, '')}
    GROUP BY p.property_use_standardized
    ORDER BY count DESC
    LIMIT 10
  `;

  // Execute all queries in parallel
  const [mainResult, summaryResult, typeCountsResult] = await Promise.all([
    pool.query(mainQuery, params),
    pool.query(summaryQuery, params.slice(0, -1)), // Remove limit param
    pool.query(typeCountsQuery, params.slice(0, -1)),
  ]);

  // Build property type counts object
  const propertyTypes = {};
  for (const row of typeCountsResult.rows) {
    propertyTypes[row.code] = parseInt(row.count);
  }

  // Format response
  const properties = mainResult.rows.map(row => ({
    attomId: row.attom_id,
    addressFull: row.address_full,
    addressCity: row.address_city,
    addressZip: row.address_zip,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    propertyUseStandardized: row.property_use_standardized,
    propertyUseGroup: row.property_use_group,
    yearBuilt: row.year_built,
    areaBuilding: row.area_building,
    areaLotAcres: parseFloat(row.area_lot_acres),
    taxAssessedValueTotal: parseFloat(row.tax_assessed_value_total),
    lastSaleDate: row.last_sale_date,
    lastSalePrice: parseFloat(row.last_sale_price),
  }));

  const summary = {
    totalValue: parseFloat(summaryResult.rows[0]?.total_value) || 0,
    avgValue: Math.round(parseFloat(summaryResult.rows[0]?.avg_value) || 0),
    avgLotAcres: Math.round((parseFloat(summaryResult.rows[0]?.avg_lot_acres) || 0) * 100) / 100,
    avgBuildingSqft: Math.round(parseFloat(summaryResult.rows[0]?.avg_building_sqft) || 0),
    propertyTypes,
  };

  return {
    properties,
    count: parseInt(summaryResult.rows[0]?.total_count) || properties.length,
    summary,
  };
}

module.exports = {
  queryPropertiesInPolygon,
};
