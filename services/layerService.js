const pool = require('../db/pool');

async function getParcelBoundaries(bbox, limit = 5000) {
  const query = `
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(
      json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(pb.geometry)::json,
        'properties', json_build_object('id', pb.id, 'apn', pb.apn, 'address', pb.address_line1, 'city', pb.city, 'state', pb.state, 'zip', pb.zip5))
    ), '[]'::json)) as geojson
    FROM (SELECT id, apn, address_line1, city, state, zip5, geometry FROM parcel_boundaries WHERE geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326) LIMIT $5) pb`;
  const result = await pool.query(query, [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, limit]);
  return result.rows[0].geojson;
}

async function getFloodZones(bbox, limit = 2000) {
  const query = `
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(
      json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(fz.geometry)::json,
        'properties', json_build_object('id', fz.id, 'zoneType', fz.zone_type, 'zoneDescription', fz.zone_description, 'isSfha', fz.is_sfha, 'staticBfe', fz.static_bfe, 'dfirmId', fz.dfirm_id))
    ), '[]'::json)) as geojson
    FROM (SELECT id, zone_type, zone_description, is_sfha, static_bfe, dfirm_id, geometry FROM fema_flood_zones WHERE geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326) LIMIT $5) fz`;
  const result = await pool.query(query, [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, limit]);
  return result.rows[0].geojson;
}

async function getSchoolDistricts(bbox, limit = 500) {
  const query = `
    SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(
      json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(sd.geometry)::json,
        'properties', json_build_object('ncesDistrictId', sd.nces_district_id, 'name', sd.name, 'level', sd.level))
    ), '[]'::json)) as geojson
    FROM (SELECT nces_district_id, name, level, geometry FROM school_districts WHERE geometry && ST_MakeEnvelope($1, $2, $3, $4, 4326) LIMIT $5) sd`;
  const result = await pool.query(query, [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat, limit]);
  return result.rows[0].geojson;
}

module.exports = { getParcelBoundaries, getFloodZones, getSchoolDistricts };
