const pool = require('../db/pool');

const cache = new Map();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function getStreetViewImage(attomId) {
  const cached = cache.get(String(attomId));
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const result = await pool.query(
    'SELECT latitude, longitude FROM properties WHERE attom_id = $1',
    [attomId]
  );

  if (result.rows.length === 0) {
    throw new Error('Property not found');
  }

  const { latitude, longitude } = result.rows[0];

  if (!latitude || !longitude) {
    throw new Error('Property has no coordinates');
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

  let responseData;

  if (GOOGLE_API_KEY) {
    try {
      const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${GOOGLE_API_KEY}`;
      const metaResponse = await fetch(metadataUrl);
      const metadata = await metaResponse.json();

      if (metadata.status === 'OK') {
        const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&heading=0&pitch=0&fov=90&key=${GOOGLE_API_KEY}`;
        const googleMapsUrl = `https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t`;

        responseData = {
          imageUrl,
          source: 'streetview',
          googleMapsUrl,
        };
      }
    } catch (err) {
      console.error('[StreetView] Google API error, falling back to satellite:', err.message);
    }
  }

  if (!responseData) {
    const satelliteUrl = MAPBOX_TOKEN
      ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lng},${lat},17,0/600x400@2x?access_token=${MAPBOX_TOKEN}`
      : null;

    responseData = {
      imageUrl: satelliteUrl,
      source: 'satellite',
      googleMapsUrl: null,
    };
  }

  cache.set(String(attomId), {
    data: responseData,
    timestamp: Date.now(),
  });

  return responseData;
}

module.exports = { getStreetViewImage };
