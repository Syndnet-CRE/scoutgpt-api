const pool = require('../db/pool');

const UNIFIED_GROUPS = {
  water: 'water_lines',
  sewer: 'wastewater_lines',
  storm: 'stormwater_lines',
  zoning: 'zoning_districts',
  flood: 'floodplains',
};

const LIMIT = 15000;

async function queryByBbox(layerType, bbox) {
  const unifiedGroup = UNIFIED_GROUPS[layerType];
  if (!unifiedGroup) {
    throw new Error(`Unknown layer type: ${layerType}`);
  }

  const [west, south, east, north] = bbox;

  const sql = `
    SELECT
      id,
      ST_AsGeoJSON(geom)::json as geometry,
      diameter,
      material,
      zone_code,
      flood_zone,
      attributes
    FROM gis_infrastructure
    WHERE unified_group = $1
      AND ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
    LIMIT $6
  `;

  const result = await pool.query(sql, [unifiedGroup, west, south, east, north, LIMIT]);
  return result.rows;
}

function deriveZoneCategory(row) {
  const attrs = row.attributes || {};
  return attrs.ZONING_BASE || attrs.zoning_base || row.zone_code || null;
}

function deriveIsSfha(floodZone) {
  if (!floodZone) return false;
  const fz = floodZone.toUpperCase();
  return fz.includes('100-YEAR') || fz.includes('100 YEAR') ||
         fz.startsWith('A') || fz.startsWith('V') ||
         fz.includes('SFHA') || fz.includes('SPECIAL FLOOD');
}

function buildFeatureCollection(rows, layerType) {
  const features = rows.map((row) => {
    let properties = { id: row.id };

    if (layerType === 'water' || layerType === 'sewer' || layerType === 'storm') {
      properties.diameter = row.diameter;
      properties.material = row.material;
    } else if (layerType === 'zoning') {
      const zoneCategory = deriveZoneCategory(row);
      properties.zone_code = row.zone_code;
      properties.zone_category = zoneCategory;
      properties._zone_category = zoneCategory;
    } else if (layerType === 'flood') {
      const isSfha = deriveIsSfha(row.flood_zone);
      properties.flood_zone = row.flood_zone;
      properties._flood_zone = row.flood_zone;
      properties.is_sfha = isSfha;
    }

    return {
      type: 'Feature',
      geometry: row.geometry,
      properties,
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function getGisLayer(layerType, bbox) {
  const rows = await queryByBbox(layerType, bbox);
  return buildFeatureCollection(rows, layerType);
}

module.exports = {
  getGisLayer,
  UNIFIED_GROUPS,
};
