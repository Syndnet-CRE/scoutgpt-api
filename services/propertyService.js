const pool = require('../db/pool');
const { normalizeRow, normalizeRows } = require('../utils/normalize');

// Zoning category to local code mapping
const ZONING_CATEGORY_MAP = {
  residential: ['SF-1','SF-2','SF-3','SF-4A','SF-4B','SF-5','SF-6','MF-1','MF-2','MF-3','MF-4','MF-5','MF-6','MH','RR','LA','R-1','R-2','R-3'],
  commercial: ['GR','CR','CS','CS-1','CH','LR','NO','W/LO','CBD','C-1','C-2','C-3'],
  industrial: ['LI','MI','IP','W/LO-I','I-1','I-2'],
  mixed_use: ['DMU','MU','PUD','TOD','VMU','V'],
  agricultural: ['AG','DR'],
};

async function searchProperties({ bbox, filters = {}, limit = 500 }) {
  const params = [];
  const conditions = [];
  let paramIndex = 1;

  if (bbox) {
    conditions.push(`p.location && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`);
    params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
    paramIndex += 4;
  }

  if (filters.absenteeOwner) {
    conditions.push(`EXISTS (SELECT 1 FROM ownership o WHERE o.attom_id = p.attom_id AND o.ownership_sequence = 1 AND o.is_absentee_owner = true)`);
  }
  if (filters.ownerOccupied) {
    conditions.push(`EXISTS (SELECT 1 FROM ownership o WHERE o.attom_id = p.attom_id AND o.ownership_sequence = 1 AND o.is_owner_occupied = true)`);
  }
  if (filters.corporateOwned) {
    conditions.push(`EXISTS (SELECT 1 FROM ownership o WHERE o.attom_id = p.attom_id AND o.ownership_sequence = 1 AND o.company_flag = true)`);
  }
  if (filters.foreclosure) {
    conditions.push(`EXISTS (SELECT 1 FROM foreclosure_records fr WHERE fr.attom_id = p.attom_id AND fr.status = 'Active')`);
  }
  if (filters.recentSales) {
    conditions.push(`p.last_sale_date >= NOW() - INTERVAL '12 months'`);
  }
  // propertyType: support multiple codes via ANY() array match
  if (filters.propertyType) {
    const codes = String(filters.propertyType).split(',').map(c => c.trim());
    conditions.push(`p.property_use_standardized = ANY($${paramIndex}::text[])`);
    params.push(codes);
    paramIndex++;
  }
  if (filters.minAcres) {
    conditions.push(`p.area_lot_acres >= $${paramIndex}`);
    params.push(filters.minAcres);
    paramIndex++;
  }
  if (filters.maxAcres) {
    conditions.push(`p.area_lot_acres <= $${paramIndex}`);
    params.push(filters.maxAcres);
    paramIndex++;
  }
  if (filters.minValue) {
    conditions.push(`p.tax_assessed_value_total >= $${paramIndex}`);
    params.push(filters.minValue);
    paramIndex++;
  }
  if (filters.maxValue) {
    conditions.push(`p.tax_assessed_value_total <= $${paramIndex}`);
    params.push(filters.maxValue);
    paramIndex++;
  }
  if (filters.zipCode) {
    conditions.push(`p.address_zip = $${paramIndex}`);
    params.push(filters.zipCode);
    paramIndex++;
  }

  // GIS Filters: Zoning
  if (filters.zoningCodes) {
    const codes = Array.isArray(filters.zoningCodes) ? filters.zoningCodes : String(filters.zoningCodes).split(',').map(c => c.trim());
    conditions.push(`p.zoning_local = ANY($${paramIndex}::text[])`);
    params.push(codes);
    paramIndex++;
  }
  if (filters.zoningCategory) {
    const category = String(filters.zoningCategory).toLowerCase();
    const codes = ZONING_CATEGORY_MAP[category];
    if (codes && codes.length > 0) {
      conditions.push(`p.zoning_local = ANY($${paramIndex}::text[])`);
      params.push(codes);
      paramIndex++;
    }
  }
  if (filters.jurisdiction) {
    conditions.push(`p.zoning_jurisdiction ILIKE $${paramIndex}`);
    params.push(`%${filters.jurisdiction}%`);
    paramIndex++;
  }

  // GIS Filters: Flood
  if (filters.excludeFloodplain) {
    conditions.push(`(p.in_floodplain = false OR p.in_floodplain IS NULL)`);
  }
  if (filters.floodZones) {
    const zones = Array.isArray(filters.floodZones) ? filters.floodZones : String(filters.floodZones).split(',').map(z => z.trim());
    conditions.push(`p.flood_zone = ANY($${paramIndex}::text[])`);
    params.push(zones);
    paramIndex++;
  }

  // GIS Filters: Infrastructure
  if (filters.maxWaterDistanceFt) {
    conditions.push(`p.nearest_water_ft <= $${paramIndex}`);
    params.push(filters.maxWaterDistanceFt);
    paramIndex++;
  }
  if (filters.minWaterDiameterIn) {
    conditions.push(`p.nearest_water_diam >= $${paramIndex}`);
    params.push(filters.minWaterDiameterIn);
    paramIndex++;
  }
  if (filters.maxSewerDistanceFt) {
    conditions.push(`p.nearest_sewer_ft <= $${paramIndex}`);
    params.push(filters.maxSewerDistanceFt);
    paramIndex++;
  }
  if (filters.maxStormDistanceFt) {
    conditions.push(`p.nearest_storm_ft <= $${paramIndex}`);
    params.push(filters.maxStormDistanceFt);
    paramIndex++;
  }

  // City filter (uses address_city)
  if (filters.city) {
    conditions.push(`p.address_city ILIKE $${paramIndex}`);
    params.push(`%${filters.city}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Sort support
  const validSortColumns = {
    nearest_water_ft: 'p.nearest_water_ft',
    nearest_sewer_ft: 'p.nearest_sewer_ft',
    nearest_storm_ft: 'p.nearest_storm_ft',
    area_lot_acres: 'p.area_lot_acres',
    tax_assessed_value_total: 'p.tax_assessed_value_total',
    area_building: 'p.area_building',
    last_sale_price: 'p.last_sale_price',
    year_built: 'p.year_built',
  };
  let orderClause = '';
  if (filters.sortBy && validSortColumns[filters.sortBy]) {
    const direction = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';
    orderClause = `ORDER BY ${validSortColumns[filters.sortBy]} ${direction} NULLS LAST`;
  }

  params.push(Math.min(limit, 2000));

  const query = `
    SELECT p.attom_id, p.fips_code, p.parcel_number_raw, p.address_full,
      p.address_city, p.address_state, p.address_zip, p.latitude, p.longitude,
      p.property_use_standardized, p.year_built, p.bedrooms_count, p.bath_count,
      p.area_building, p.area_lot_sf, p.area_lot_acres, p.tax_assessed_value_total,
      p.last_sale_date, p.last_sale_price,
      p.zoning_local, p.zoning_jurisdiction, p.flood_zone, p.flood_zone_desc, p.in_floodplain,
      p.nearest_water_ft, p.nearest_water_diam, p.nearest_water_material,
      p.nearest_sewer_ft, p.nearest_sewer_diam, p.nearest_storm_ft, p.nearest_storm_diam
    FROM properties p
    ${whereClause}
    ${orderClause}
    LIMIT $${paramIndex}
  `;

  const result = await pool.query(query, params);
  return normalizeRows(result.rows);
}

async function getPropertyDetail(attomId) {
  const [propertyResult, ownershipResult, taxResult, salesResult, loansResult, valuationsResult, climateResult, permitsResult, foreclosureResult] = await Promise.all([
    pool.query(`
      SELECT
        p.*,
        pd.legal_description, pd.legal_lot, pd.legal_block, pd.legal_section,
        pd.construction_type, pd.exterior_walls, pd.interior_walls,
        pd.foundation, pd.roof_type, pd.roof_material, pd.floor_type,
        pd.garage_type, pd.garage_area, pd.parking_spaces,
        pd.pool_type, pd.has_pool, pd.has_spa,
        pd.has_elevator, pd.has_fireplace, pd.fireplace_count,
        pd.hvac_cooling, pd.hvac_heating, pd.hvac_fuel,
        pd.quality_grade, pd.condition, pd.gross_area
      FROM properties p
      LEFT JOIN property_details pd ON pd.attom_id = p.attom_id
      WHERE p.attom_id = $1`, [attomId]),
    pool.query(`SELECT * FROM ownership WHERE attom_id = $1 ORDER BY ownership_sequence ASC`, [attomId]),
    pool.query(`SELECT * FROM tax_assessments WHERE attom_id = $1 ORDER BY tax_year DESC LIMIT 5`, [attomId]),
    pool.query(`SELECT st.* FROM sales_transactions st WHERE st.attom_id = $1 ORDER BY st.recording_date DESC LIMIT 10`, [attomId]),
    pool.query(`SELECT * FROM current_loans WHERE attom_id = $1 ORDER BY loan_position ASC`, [attomId]),
    pool.query(`SELECT * FROM property_valuations WHERE attom_id = $1 ORDER BY valuation_date DESC LIMIT 5`, [attomId]),
    pool.query(`SELECT * FROM climate_risk WHERE attom_id = $1`, [attomId]),
    pool.query(`SELECT * FROM building_permits WHERE attom_id = $1 ORDER BY effective_date DESC LIMIT 20`, [attomId]),
    pool.query(`SELECT * FROM foreclosure_records WHERE attom_id = $1 ORDER BY foreclosure_recording_date DESC`, [attomId]),
  ]);

  if (propertyResult.rows.length === 0) return null;

  // Attach mortgages to each sale
  const sales = [];
  for (const sale of salesResult.rows) {
    const mortgageResult = await pool.query(
      `SELECT * FROM mortgage_records WHERE transaction_id = $1 ORDER BY mortgage_position ASC`,
      [sale.transaction_id]
    );
    sales.push({
      ...normalizeRow(sale),
      mortgages: normalizeRows(mortgageResult.rows),
    });
  }

  // Normalize property and climate data
  const property = normalizeRow(propertyResult.rows[0]);
  const climate = normalizeRow(climateResult.rows[0]);

  // Cast numeric GIS fields to Number (PostgreSQL returns NUMERIC as strings)
  const numericGisFields = ['nearestWaterFt', 'nearestWaterDiam', 'nearestSewerFt', 'nearestSewerDiam', 'nearestStormFt', 'nearestStormDiam'];
  for (const field of numericGisFields) {
    if (property[field] != null) property[field] = Number(property[field]);
  }
  if (climate && climate.floodChanceFuture != null) {
    climate.floodChanceFuture = Number(climate.floodChanceFuture);
  }

  return {
    ...property,
    ownership: normalizeRows(ownershipResult.rows),
    taxAssessments: normalizeRows(taxResult.rows),
    salesTransactions: sales,
    currentLoans: normalizeRows(loansResult.rows),
    valuations: normalizeRows(valuationsResult.rows),
    climateRisk: climate || null,
    buildingPermits: normalizeRows(permitsResult.rows),
    foreclosureRecords: normalizeRows(foreclosureResult.rows),
  };
}

async function getMarketStats({ zipCode, fipsCode, propertyType }) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;
  if (zipCode) { conditions.push(`address_zip = $${paramIndex}`); params.push(zipCode); paramIndex++; }
  if (fipsCode) { conditions.push(`fips_code = $${paramIndex}`); params.push(fipsCode); paramIndex++; }
  if (propertyType) { conditions.push(`property_use_standardized = $${paramIndex}`); params.push(propertyType); paramIndex++; }
  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await pool.query(`
    SELECT COUNT(*) as total_properties, AVG(tax_assessed_value_total)::numeric(12,2) as avg_assessed_value,
      AVG(last_sale_price)::numeric(12,2) as avg_sale_price, AVG(area_building)::numeric(10,2) as avg_building_area,
      AVG(area_lot_acres)::numeric(10,4) as avg_lot_acres, MIN(last_sale_price) as min_sale_price,
      MAX(last_sale_price) as max_sale_price, AVG(year_built)::integer as avg_year_built
    FROM properties ${whereClause}
  `, params);
  return normalizeRow(result.rows[0]);
}

module.exports = { searchProperties, getPropertyDetail, getMarketStats };
