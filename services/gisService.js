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
      source_server,
      attributes
    FROM gis_infrastructure
    WHERE unified_group = $1
      AND ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
    LIMIT $6
  `;

  const result = await pool.query(sql, [unifiedGroup, west, south, east, north, LIMIT]);
  return result.rows;
}

function deriveZoneCode(row) {
  // Extract zone code from column or attributes (handles NULL columns)
  if (row.zone_code) return row.zone_code;
  const attrs = row.attributes || {};
  return attrs.ZONING_ZTYPE || attrs.ZONING_ZTYP || attrs.ZONING || attrs.ZONE_CODE ||
         attrs.zoning_ztype || attrs.zone_code || null;
}

function deriveZoneCategory(row) {
  const attrs = row.attributes || {};
  const zoneCode = deriveZoneCode(row);
  return attrs.ZONING_BASE || attrs.zoning_base || zoneCode || null;
}

function deriveFloodZone(row) {
  // Extract flood zone from column or attributes (handles NULL columns)
  if (row.flood_zone) return row.flood_zone;
  const attrs = row.attributes || {};
  return attrs.FLOOD_ZONE || attrs.FLD_ZONE || attrs.FEMA_FLOOD_ZONE ||
         attrs.FloodZone || attrs.ZONE_ || attrs.flood_zone || null;
}

function deriveStormwaterFields(row) {
  // Extract diameter and material from stormwater attributes
  const attrs = row.attributes || {};
  const diameter = row.diameter || attrs.SIZE_WIDTH || attrs.PIPE_SIZE || attrs.DIAMETER || null;
  const material = row.material || attrs.PIPE_MAT || attrs.MATERIAL || attrs.PIPE_MATERIAL || null;
  return { diameter, material };
}

function deriveSource(row) {
  // Extract a friendly source name from source_server
  if (!row.source_server) return null;
  // source_server format: "https://services.arcgis.com/xxx/arcgis/rest/services/..."
  const s = row.source_server.toLowerCase();
  if (s.includes('austin') || s.includes('coatx')) return 'City of Austin';
  if (s.includes('roundrock') || s.includes('rroc')) return 'Round Rock';
  if (s.includes('cedarpark') || s.includes('cptx')) return 'Cedar Park';
  if (s.includes('pflugerville') || s.includes('pfluger')) return 'Pflugerville';
  if (s.includes('georgetown')) return 'Georgetown';
  if (s.includes('kyle')) return 'Kyle';
  if (s.includes('sanmarcos')) return 'San Marcos';
  return null;
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
    const source = deriveSource(row);
    if (source) properties.source = source;

    if (layerType === 'water' || layerType === 'sewer') {
      properties.diameter = row.diameter;
      properties.material = row.material;
    } else if (layerType === 'storm') {
      // Stormwater often has different field names in attributes
      const stormFields = deriveStormwaterFields(row);
      properties.diameter = stormFields.diameter;
      properties.material = stormFields.material;
    } else if (layerType === 'zoning') {
      const zoneCode = deriveZoneCode(row);
      const zoneCategory = deriveZoneCategory(row);
      properties.zone_code = zoneCode;
      properties.zone_category = zoneCategory;
      properties._zone_category = zoneCategory;
    } else if (layerType === 'flood') {
      const floodZone = deriveFloodZone(row);
      const isSfha = deriveIsSfha(floodZone);
      properties.flood_zone = floodZone;
      properties._flood_zone = floodZone;
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
