const pool = require('../db/pool');
const { normalizeRow, normalizeRows } = require('../utils/normalize');

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
  if (filters.propertyType) {
    conditions.push(`p.property_use_standardized = $${paramIndex}`);
    params.push(filters.propertyType);
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

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(Math.min(limit, 2000));

  const query = `
    SELECT p.attom_id, p.fips_code, p.parcel_number_raw, p.address_full,
      p.address_city, p.address_state, p.address_zip, p.latitude, p.longitude,
      p.property_use_standardized, p.year_built, p.bedrooms_count, p.bath_count,
      p.area_building, p.area_lot_sf, p.area_lot_acres, p.tax_assessed_value_total,
      p.last_sale_date, p.last_sale_price
    FROM properties p
    ${whereClause}
    LIMIT $${paramIndex}
  `;

  const result = await pool.query(query, params);
  return normalizeRows(result.rows);
}

async function getPropertyDetail(attomId) {
  const [propertyResult, ownershipResult, taxResult, salesResult, loansResult, valuationsResult, climateResult, permitsResult, foreclosureResult] = await Promise.all([
    pool.query(`
      SELECT p.*, pd.legal_description, pd.legal_lot, pd.legal_block, pd.construction_type,
        pd.exterior_walls, pd.foundation, pd.roof_type, pd.roof_material, pd.floor_type,
        pd.garage_type, pd.garage_area, pd.parking_spaces, pd.pool_type, pd.has_pool,
        pd.has_spa, pd.has_elevator, pd.has_fireplace, pd.fireplace_count,
        pd.hvac_cooling, pd.hvac_heating, pd.hvac_fuel, pd.quality_grade, pd.condition
      FROM properties p
      LEFT JOIN property_details pd ON pd.attom_id = p.attom_id
      WHERE p.attom_id = $1`, [attomId]),
    pool.query(`SELECT * FROM ownership WHERE attom_id = $1 ORDER BY ownership_sequence ASC`, [attomId]),
    pool.query(`SELECT * FROM tax_assessments WHERE attom_id = $1 ORDER BY tax_year DESC LIMIT 5`, [attomId]),
    pool.query(`SELECT * FROM sales_transactions WHERE attom_id = $1 ORDER BY recording_date DESC LIMIT 10`, [attomId]),
    pool.query(`SELECT * FROM current_loans WHERE attom_id = $1 ORDER BY loan_position ASC`, [attomId]),
    pool.query(`SELECT * FROM property_valuations WHERE attom_id = $1 ORDER BY valuation_date DESC LIMIT 5`, [attomId]),
    pool.query(`SELECT * FROM climate_risk WHERE attom_id = $1`, [attomId]),
    pool.query(`SELECT * FROM building_permits WHERE attom_id = $1 ORDER BY effective_date DESC LIMIT 10`, [attomId]),
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

  return {
    ...normalizeRow(propertyResult.rows[0]),
    ownership: normalizeRows(ownershipResult.rows),
    taxAssessments: normalizeRows(taxResult.rows),
    salesTransactions: sales,
    currentLoans: normalizeRows(loansResult.rows),
    valuations: normalizeRows(valuationsResult.rows),
    climateRisk: normalizeRow(climateResult.rows[0]) || null,
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
