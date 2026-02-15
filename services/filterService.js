// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Filter Service
// File: services/filterService.js
//
// CTE-based query builder for property filtering.
// Handles all 15 filters across 5 tabs with parameterized SQL.
// Returns attom_id + lat/lng for map rendering + total count.
// ══════════════════════════════════════════════════════════════

const pool = require('../db/pool');
const {
  buildAssetClassCondition,
  buildOwnerTypeCondition,
  buildForeclosureTypeCondition,
  getAssetClassLabel,
} = require('../utils/filterMappings');

// ──────────────────────────────────────────────────────────────
// MAIN FILTER FUNCTION
// ──────────────────────────────────────────────────────────────

/**
 * Filters properties based on provided criteria
 * @param {Object} filters - Filter criteria
 * @param {Object} filters.bbox - Bounding box {west, south, east, north}
 * @param {string[]} filters.assetClass - Asset class IDs
 * @param {number} filters.lotSizeMin - Min lot size in acres
 * @param {number} filters.lotSizeMax - Max lot size in acres
 * @param {number} filters.buildingSizeMin - Min building size in sqft
 * @param {number} filters.buildingSizeMax - Max building size in sqft
 * @param {number} filters.yearBuiltMin - Min year built
 * @param {number} filters.yearBuiltMax - Max year built
 * @param {number|string} filters.stories - Number of stories or "5+"
 * @param {string[]} filters.ownerType - Owner type IDs
 * @param {boolean} filters.absenteeOnly - Only absentee owners
 * @param {string} filters.ownerName - Owner name search
 * @param {number} filters.soldWithinDays - Days since sale
 * @param {number} filters.salePriceMin - Min sale price
 * @param {number} filters.salePriceMax - Max sale price
 * @param {boolean} filters.armsLengthOnly - Only arms-length sales (default true)
 * @param {boolean} filters.investorOnly - Only investor purchases
 * @param {boolean} filters.distressedSalesOnly - Only distressed sales
 * @param {number} filters.ltvMin - Min LTV percentage
 * @param {number} filters.ltvMax - Max LTV percentage
 * @param {boolean} filters.highLtvOnly - Only high LTV (>80%)
 * @param {number} filters.equityMin - Min available equity
 * @param {number} filters.equityMax - Max available equity
 * @param {boolean} filters.hasForeclosure - Has active foreclosure
 * @param {string[]} filters.foreclosureType - Foreclosure types [NTS, LIS, NOD]
 * @param {number} filters.foreclosureFiledDays - Days since foreclosure filed
 * @param {number} filters.auctionWithinDays - Auction within N days
 * @param {number} filters.distressScoreMin - Min distress score 0-100
 * @param {number} filters.floodRiskMin - Min flood risk score 0-100
 * @param {boolean} filters.inFloodZone - In FEMA SFHA flood zone
 * @param {number} options.limit - Max results (default 5000)
 * @returns {Object} { count, properties, filters, bbox }
 */
async function filterProperties(filters = {}, options = {}) {
  const { limit = 5000 } = options;
  const params = [];
  let paramIndex = 1;

  // Track which joins are needed
  const joins = {
    ownership: false,
    salesTransactions: false,
    propertyValuations: false,
    foreclosureRecords: false,
    climateRisk: false,
    femaFloodZones: false,
  };

  // Base conditions (always applied)
  const baseConditions = [];

  // Additional conditions for joined tables
  const ownershipConditions = [];
  const salesConditions = [];
  const valuationConditions = [];
  const foreclosureConditions = [];
  const climateConditions = [];

  // ═══════════════════════════════════════════════════════════
  // BBOX (Required)
  // ═══════════════════════════════════════════════════════════
  if (!filters.bbox) {
    throw new Error('bbox is required');
  }
  const { west, south, east, north } = filters.bbox;
  baseConditions.push(`p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`);
  params.push(west, south, east, north);
  paramIndex += 4;

  // ═══════════════════════════════════════════════════════════
  // PROPERTY TAB FILTERS
  // ═══════════════════════════════════════════════════════════

  // Asset Class
  if (filters.assetClass && filters.assetClass.length > 0) {
    const assetCondition = buildAssetClassCondition(filters.assetClass);
    if (assetCondition) {
      baseConditions.push(assetCondition);
    }
  }

  // Lot Size (acres)
  if (filters.lotSizeMin != null) {
    baseConditions.push(`p.area_lot_acres >= $${paramIndex}`);
    params.push(filters.lotSizeMin);
    paramIndex++;
  }
  if (filters.lotSizeMax != null) {
    baseConditions.push(`p.area_lot_acres <= $${paramIndex}`);
    params.push(filters.lotSizeMax);
    paramIndex++;
  }

  // Building Size (sqft)
  if (filters.buildingSizeMin != null) {
    baseConditions.push(`p.area_building >= $${paramIndex}`);
    params.push(filters.buildingSizeMin);
    paramIndex++;
  }
  if (filters.buildingSizeMax != null) {
    baseConditions.push(`p.area_building <= $${paramIndex}`);
    params.push(filters.buildingSizeMax);
    paramIndex++;
  }

  // Year Built
  if (filters.yearBuiltMin != null) {
    baseConditions.push(`p.year_built >= $${paramIndex}`);
    params.push(filters.yearBuiltMin);
    paramIndex++;
  }
  if (filters.yearBuiltMax != null) {
    baseConditions.push(`p.year_built <= $${paramIndex}`);
    params.push(filters.yearBuiltMax);
    paramIndex++;
  }

  // Stories
  if (filters.stories != null) {
    if (filters.stories === '5+' || filters.stories >= 5) {
      baseConditions.push('p.stories_count >= 5');
    } else {
      baseConditions.push(`p.stories_count = $${paramIndex}`);
      params.push(filters.stories);
      paramIndex++;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // OWNERSHIP TAB FILTERS
  // ═══════════════════════════════════════════════════════════

  // Owner Type
  if (filters.ownerType && filters.ownerType.length > 0) {
    joins.ownership = true;
    const ownerCondition = buildOwnerTypeCondition(filters.ownerType);
    if (ownerCondition) {
      ownershipConditions.push(ownerCondition);
    }
  }

  // Absentee Only (mail city != property city)
  if (filters.absenteeOnly) {
    joins.ownership = true;
    ownershipConditions.push('o.mail_address_city IS DISTINCT FROM p.address_city');
  }

  // Owner Name Search
  if (filters.ownerName && filters.ownerName.trim()) {
    joins.ownership = true;
    ownershipConditions.push(`o.owner1_name_full ILIKE $${paramIndex}`);
    params.push(`%${filters.ownerName.trim()}%`);
    paramIndex++;
  }

  // ═══════════════════════════════════════════════════════════
  // SALES TAB FILTERS
  // ═══════════════════════════════════════════════════════════

  // Sold Within Days
  if (filters.soldWithinDays != null) {
    joins.salesTransactions = true;
    salesConditions.push(`st.recording_date >= NOW() - INTERVAL '${parseInt(filters.soldWithinDays)} days'`);
  }

  // Sale Price Range
  if (filters.salePriceMin != null) {
    joins.salesTransactions = true;
    salesConditions.push(`st.sale_price >= $${paramIndex}`);
    params.push(filters.salePriceMin);
    paramIndex++;
  }
  if (filters.salePriceMax != null) {
    joins.salesTransactions = true;
    salesConditions.push(`st.sale_price <= $${paramIndex}`);
    params.push(filters.salePriceMax);
    paramIndex++;
  }

  // Arms-Length Only (default true)
  const armsLengthOnly = filters.armsLengthOnly !== false;
  if (armsLengthOnly && joins.salesTransactions) {
    salesConditions.push('st.is_arms_length = true');
  }

  // Investor Only
  if (filters.investorOnly) {
    joins.salesTransactions = true;
    salesConditions.push('st.grantee_investor_flag = true');
  }

  // Distressed Sales Only
  if (filters.distressedSalesOnly) {
    joins.salesTransactions = true;
    salesConditions.push('st.is_distressed = true');
  }

  // ═══════════════════════════════════════════════════════════
  // FINANCIAL TAB FILTERS
  // ═══════════════════════════════════════════════════════════

  // LTV Range
  if (filters.ltvMin != null) {
    joins.propertyValuations = true;
    valuationConditions.push(`pv.ltv >= $${paramIndex}`);
    params.push(filters.ltvMin / 100); // Convert percentage to decimal
    paramIndex++;
  }
  if (filters.ltvMax != null) {
    joins.propertyValuations = true;
    valuationConditions.push(`pv.ltv <= $${paramIndex}`);
    params.push(filters.ltvMax / 100);
    paramIndex++;
  }

  // High LTV Only (>80%)
  if (filters.highLtvOnly) {
    joins.propertyValuations = true;
    valuationConditions.push('pv.ltv > 0.80');
  }

  // Equity Range
  if (filters.equityMin != null) {
    joins.propertyValuations = true;
    valuationConditions.push(`pv.available_equity >= $${paramIndex}`);
    params.push(filters.equityMin);
    paramIndex++;
  }
  if (filters.equityMax != null) {
    joins.propertyValuations = true;
    valuationConditions.push(`pv.available_equity <= $${paramIndex}`);
    params.push(filters.equityMax);
    paramIndex++;
  }

  // ═══════════════════════════════════════════════════════════
  // RISK TAB FILTERS
  // ═══════════════════════════════════════════════════════════

  // Has Foreclosure
  if (filters.hasForeclosure) {
    joins.foreclosureRecords = true;
    foreclosureConditions.push('fr.attom_id IS NOT NULL');
  }

  // Foreclosure Type
  if (filters.foreclosureType && filters.foreclosureType.length > 0) {
    joins.foreclosureRecords = true;
    const fcTypeCondition = buildForeclosureTypeCondition(filters.foreclosureType);
    if (fcTypeCondition) {
      foreclosureConditions.push(fcTypeCondition);
    }
  }

  // Foreclosure Filed Within Days
  if (filters.foreclosureFiledDays != null) {
    joins.foreclosureRecords = true;
    foreclosureConditions.push(`fr.foreclosure_recording_date >= NOW() - INTERVAL '${parseInt(filters.foreclosureFiledDays)} days'`);
  }

  // Auction Within Days
  if (filters.auctionWithinDays != null) {
    joins.foreclosureRecords = true;
    foreclosureConditions.push(`fr.auction_date <= NOW() + INTERVAL '${parseInt(filters.auctionWithinDays)} days'`);
    foreclosureConditions.push('fr.auction_date >= NOW()');
  }

  // Flood Risk Min
  if (filters.floodRiskMin != null) {
    joins.climateRisk = true;
    climateConditions.push(`cr.flood_risk_score >= $${paramIndex}`);
    params.push(filters.floodRiskMin);
    paramIndex++;
  }

  // In Flood Zone (FEMA SFHA)
  if (filters.inFloodZone) {
    joins.femaFloodZones = true;
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD CTE QUERY
  // ═══════════════════════════════════════════════════════════

  const ctes = [];
  const selectFields = [
    'p.attom_id',
    'p.latitude',
    'p.longitude',
    'p.address_full',
    'p.property_use_standardized',
    'p.area_building',
  ];

  // Base CTE - always present
  let baseCteWhere = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';

  // Add ownership join if needed
  let ownershipJoin = '';
  if (joins.ownership) {
    ownershipJoin = 'JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1';
    if (ownershipConditions.length > 0) {
      baseCteWhere += (baseCteWhere ? ' AND ' : 'WHERE ') + ownershipConditions.join(' AND ');
    }
  }

  // Build the base CTE
  ctes.push(`
    base_props AS (
      SELECT DISTINCT ON (p.attom_id)
        ${selectFields.join(', ')}
      FROM properties p
      ${ownershipJoin}
      ${baseCteWhere}
      LIMIT ${parseInt(limit) + 1000}
    )`);

  // Sales filter CTE
  if (joins.salesTransactions) {
    const salesWhere = salesConditions.length > 0 ? `AND ${salesConditions.join(' AND ')}` : '';
    ctes.push(`
    sales_filtered AS (
      SELECT DISTINCT bp.attom_id
      FROM base_props bp
      JOIN sales_transactions st ON st.attom_id = bp.attom_id
      WHERE st.sale_price > 0 ${salesWhere}
    )`);
  }

  // Valuations filter CTE
  if (joins.propertyValuations) {
    const valuationWhere = valuationConditions.length > 0 ? `WHERE ${valuationConditions.join(' AND ')}` : '';
    ctes.push(`
    valuations_filtered AS (
      SELECT DISTINCT bp.attom_id
      FROM base_props bp
      JOIN LATERAL (
        SELECT ltv, available_equity
        FROM property_valuations
        WHERE attom_id = bp.attom_id
        ORDER BY valuation_date DESC
        LIMIT 1
      ) pv ON true
      ${valuationWhere}
    )`);
  }

  // Foreclosure filter CTE
  if (joins.foreclosureRecords) {
    const foreclosureWhere = foreclosureConditions.length > 0 ? `WHERE ${foreclosureConditions.join(' AND ')}` : '';
    ctes.push(`
    foreclosure_filtered AS (
      SELECT DISTINCT bp.attom_id
      FROM base_props bp
      JOIN foreclosure_records fr ON fr.attom_id = bp.attom_id
      ${foreclosureWhere}
    )`);
  }

  // Climate risk filter CTE
  if (joins.climateRisk) {
    const climateWhere = climateConditions.length > 0 ? `WHERE ${climateConditions.join(' AND ')}` : '';
    ctes.push(`
    climate_filtered AS (
      SELECT DISTINCT bp.attom_id
      FROM base_props bp
      JOIN climate_risk cr ON cr.attom_id = bp.attom_id
      ${climateWhere}
    )`);
  }

  // FEMA flood zone filter CTE
  if (joins.femaFloodZones) {
    ctes.push(`
    flood_zone_filtered AS (
      SELECT DISTINCT bp.attom_id
      FROM base_props bp
      JOIN properties p2 ON p2.attom_id = bp.attom_id
      WHERE EXISTS (
        SELECT 1 FROM fema_flood_zones fz
        WHERE fz.is_sfha = true
        AND ST_Intersects(p2.location, fz.geometry)
      )
    )`);
  }

  // Distress score filter (computed inline)
  // Note: This is a complex composite score, handled differently
  const needsDistressScore = filters.distressScoreMin != null;

  // Build final query
  let finalFrom = 'base_props bp';
  const finalJoins = [];

  if (joins.salesTransactions) {
    finalJoins.push('JOIN sales_filtered sf ON sf.attom_id = bp.attom_id');
  }
  if (joins.propertyValuations) {
    finalJoins.push('JOIN valuations_filtered vf ON vf.attom_id = bp.attom_id');
  }
  if (joins.foreclosureRecords) {
    finalJoins.push('JOIN foreclosure_filtered ff ON ff.attom_id = bp.attom_id');
  }
  if (joins.climateRisk) {
    finalJoins.push('JOIN climate_filtered cf ON cf.attom_id = bp.attom_id');
  }
  if (joins.femaFloodZones) {
    finalJoins.push('JOIN flood_zone_filtered fzf ON fzf.attom_id = bp.attom_id');
  }

  // Build the full query
  const cteString = ctes.join(',');
  const joinsString = finalJoins.join('\n    ');

  // Add distress score CTE and filter if needed
  let distressFilter = '';
  if (needsDistressScore) {
    ctes.push(`
    distress_scored AS (
      SELECT
        bp.attom_id,
        (
          CASE WHEN fc.id IS NOT NULL AND fc.foreclosure_recording_date > CURRENT_DATE - INTERVAL '2 years' THEN 30 ELSE 0 END +
          CASE WHEN ta.tax_delinquent_year IS NOT NULL THEN
            CASE WHEN ta.tax_delinquent_year::int < EXTRACT(YEAR FROM CURRENT_DATE) - 2 THEN 20 ELSE 15 END
          ELSE 0 END +
          CASE
            WHEN pv.estimated_value > 0 AND cl.total_balance > pv.estimated_value THEN 20
            WHEN pv.estimated_value > 0 AND cl.total_balance > pv.estimated_value * 0.9 THEN 15
            WHEN pv.estimated_value > 0 AND cl.total_balance > pv.estimated_value * 0.8 THEN 10
            ELSE 0 END +
          CASE WHEN o.is_absentee_owner = true THEN 10 ELSE 0 END +
          CASE WHEN o.ownership_transfer_date < CURRENT_DATE - INTERVAL '15 years' THEN 5 ELSE 0 END
        ) AS distress_score
      FROM base_props bp
      LEFT JOIN LATERAL (
        SELECT id, foreclosure_recording_date
        FROM foreclosure_records WHERE attom_id = bp.attom_id
        ORDER BY foreclosure_recording_date DESC LIMIT 1
      ) fc ON true
      LEFT JOIN LATERAL (
        SELECT tax_delinquent_year
        FROM tax_assessments WHERE attom_id = bp.attom_id
        ORDER BY tax_year DESC LIMIT 1
      ) ta ON true
      LEFT JOIN LATERAL (
        SELECT estimated_value
        FROM property_valuations WHERE attom_id = bp.attom_id
        ORDER BY valuation_date DESC LIMIT 1
      ) pv ON true
      LEFT JOIN LATERAL (
        SELECT SUM(estimated_balance) AS total_balance
        FROM current_loans WHERE attom_id = bp.attom_id
      ) cl ON true
      LEFT JOIN ownership o ON o.attom_id = bp.attom_id AND o.ownership_sequence = 1
    )`);
    finalJoins.push(`JOIN distress_scored ds ON ds.attom_id = bp.attom_id AND ds.distress_score >= $${paramIndex}`);
    params.push(filters.distressScoreMin);
    paramIndex++;
  }

  // Rebuild CTE string and joins string with distress score
  const finalCteString = ctes.join(',');
  const finalJoinsString = finalJoins.join('\n    ');

  // Main query for results
  const mainQuery = `
    WITH ${finalCteString}
    SELECT
      bp.attom_id,
      bp.latitude,
      bp.longitude,
      bp.address_full,
      bp.property_use_standardized,
      bp.area_building
    FROM ${finalFrom}
    ${finalJoinsString}
    LIMIT $${paramIndex}
  `;
  params.push(limit);
  paramIndex++;

  // Count query (separate for performance)
  const countQuery = `
    WITH ${finalCteString}
    SELECT COUNT(*) AS total
    FROM ${finalFrom}
    ${finalJoinsString}
  `;

  // Execute both queries
  const [resultsResult, countResult] = await Promise.all([
    pool.query(mainQuery, params),
    pool.query(countQuery, params.slice(0, -1)), // Remove limit param for count
  ]);

  const rows = resultsResult.rows;
  const totalCount = parseInt(countResult.rows[0]?.total || 0);

  // Calculate bounding box of results
  let resultBbox = null;
  if (rows.length > 0) {
    const lats = rows.map(r => r.latitude).filter(Boolean);
    const lngs = rows.map(r => r.longitude).filter(Boolean);
    if (lats.length > 0 && lngs.length > 0) {
      resultBbox = [
        Math.min(...lngs), // west
        Math.min(...lats), // south
        Math.max(...lngs), // east
        Math.max(...lats), // north
      ];
    }
  }

  // Build applied filters summary
  const appliedFilters = {};
  if (filters.assetClass?.length > 0) {
    appliedFilters.assetClass = filters.assetClass.map(getAssetClassLabel);
  }
  if (filters.lotSizeMin != null || filters.lotSizeMax != null) {
    appliedFilters.lotSize = { min: filters.lotSizeMin, max: filters.lotSizeMax };
  }
  if (filters.buildingSizeMin != null || filters.buildingSizeMax != null) {
    appliedFilters.buildingSize = { min: filters.buildingSizeMin, max: filters.buildingSizeMax };
  }
  if (filters.yearBuiltMin != null || filters.yearBuiltMax != null) {
    appliedFilters.yearBuilt = { min: filters.yearBuiltMin, max: filters.yearBuiltMax };
  }
  if (filters.stories != null) {
    appliedFilters.stories = filters.stories;
  }
  if (filters.ownerType?.length > 0) {
    appliedFilters.ownerType = filters.ownerType;
  }
  if (filters.absenteeOnly) {
    appliedFilters.absenteeOnly = true;
  }
  if (filters.ownerName) {
    appliedFilters.ownerName = filters.ownerName;
  }
  if (filters.soldWithinDays != null) {
    appliedFilters.soldWithinDays = filters.soldWithinDays;
  }
  if (filters.salePriceMin != null || filters.salePriceMax != null) {
    appliedFilters.salePrice = { min: filters.salePriceMin, max: filters.salePriceMax };
  }
  if (filters.investorOnly) {
    appliedFilters.investorOnly = true;
  }
  if (filters.distressedSalesOnly) {
    appliedFilters.distressedSalesOnly = true;
  }
  if (filters.ltvMin != null || filters.ltvMax != null) {
    appliedFilters.ltv = { min: filters.ltvMin, max: filters.ltvMax };
  }
  if (filters.highLtvOnly) {
    appliedFilters.highLtvOnly = true;
  }
  if (filters.equityMin != null || filters.equityMax != null) {
    appliedFilters.equity = { min: filters.equityMin, max: filters.equityMax };
  }
  if (filters.hasForeclosure) {
    appliedFilters.hasForeclosure = true;
  }
  if (filters.foreclosureType?.length > 0) {
    appliedFilters.foreclosureType = filters.foreclosureType;
  }
  if (filters.foreclosureFiledDays != null) {
    appliedFilters.foreclosureFiledDays = filters.foreclosureFiledDays;
  }
  if (filters.auctionWithinDays != null) {
    appliedFilters.auctionWithinDays = filters.auctionWithinDays;
  }
  if (filters.distressScoreMin != null) {
    appliedFilters.distressScoreMin = filters.distressScoreMin;
  }
  if (filters.floodRiskMin != null) {
    appliedFilters.floodRiskMin = filters.floodRiskMin;
  }
  if (filters.inFloodZone) {
    appliedFilters.inFloodZone = true;
  }

  return {
    count: totalCount,
    properties: rows.map(r => ({
      attomId: r.attom_id,
      latitude: r.latitude,
      longitude: r.longitude,
      addressFull: r.address_full,
      propertyUseGroup: r.property_use_standardized,
      areaBuilding: r.area_building,
    })),
    filters: appliedFilters,
    bbox: resultBbox,
  };
}

module.exports = {
  filterProperties,
};
