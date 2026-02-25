// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Polygon Query Route
// File: routes/polygon.js
//
// POST /api/properties/polygon — Query properties within a drawn polygon
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { queryPropertiesInPolygon } = require('../services/polygonService');

/**
 * POST / — Query properties within a GeoJSON polygon
 *
 * Request body:
 * {
 *   "polygon": { "type": "Polygon", "coordinates": [[[lng, lat], ...]] },
 *   "filters": { ... },
 *   "limit": 5000
 * }
 *
 * Response:
 * {
 *   "properties": [...],
 *   "count": 47,
 *   "summary": {
 *     "totalValue": 23500000,
 *     "avgValue": 500000,
 *     "avgLotAcres": 1.2,
 *     "propertyTypes": { "369": 12, "102": 8 }
 *   }
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { polygon, filters = {}, limit = 5000 } = req.body;

    // Validate polygon
    if (!polygon) {
      return res.status(400).json({
        error: 'polygon is required',
        details: 'Request body must include a GeoJSON polygon object',
      });
    }

    if (polygon.type !== 'Polygon') {
      return res.status(400).json({
        error: 'Invalid polygon type',
        details: `Expected polygon.type to be "Polygon", got "${polygon.type}"`,
      });
    }

    if (!polygon.coordinates || !Array.isArray(polygon.coordinates)) {
      return res.status(400).json({
        error: 'Invalid polygon coordinates',
        details: 'polygon.coordinates must be an array of coordinate rings',
      });
    }

    if (polygon.coordinates.length === 0 || !Array.isArray(polygon.coordinates[0])) {
      return res.status(400).json({
        error: 'Invalid polygon coordinates',
        details: 'polygon.coordinates[0] must be an array of [lng, lat] pairs',
      });
    }

    // Validate coordinate ring has at least 4 points (closed polygon)
    const ring = polygon.coordinates[0];
    if (ring.length < 4) {
      return res.status(400).json({
        error: 'Invalid polygon',
        details: 'Polygon must have at least 4 coordinates (first and last should be identical)',
      });
    }

    // Validate limit
    const validatedLimit = Math.min(Math.max(1, parseInt(limit) || 5000), 5000);

    // Execute query
    const result = await queryPropertiesInPolygon(polygon, filters, validatedLimit);

    res.json(result);
  } catch (error) {
    console.error('[Polygon] Query error:', error);
    res.status(500).json({
      error: 'Polygon query failed',
      details: error.message,
    });
  }
});

module.exports = router;
