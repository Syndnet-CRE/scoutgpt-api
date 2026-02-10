const pool = require('../db/pool');
const { normalizeRows } = require('../utils/normalize');

async function propertiesWithinRadius(lng, lat, radiusMeters, limit = 100) {
  const query = `
    SELECT attom_id, address_line1, address_city, address_zip, latitude, longitude,
      property_use_standardized, year_built, area_building, tax_assessed_value_total,
      last_sale_price, last_sale_date,
      ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters
    FROM properties
    WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
    ORDER BY distance_meters ASC LIMIT $4`;
  const result = await pool.query(query, [lng, lat, radiusMeters, limit]);
  return normalizeRows(result.rows);
}

module.exports = { propertiesWithinRadius };
