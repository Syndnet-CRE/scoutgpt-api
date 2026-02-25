// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Clusters Route
// File: routes/clusters.js
//
// GET /api/properties/clusters — Returns property counts grouped by grid cell
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { buildAssetClassCondition } = require('../utils/filterMappings');

/**
 * Parse bbox string to array of numbers
 * @param {string} bboxStr - "west,south,east,north"
 * @returns {number[]|null} [west, south, east, north] or null
 */
function parseBbox(bboxStr) {
  if (!bboxStr) return null;
  const parts = bboxStr.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [west, south, east, north] = parts;
  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  if (south < -90 || south > 90 || north < -90 || north > 90) return null;
  if (west > east || south > north) return null;
  return [west, south, east, north];
}

/**
 * Determine grid size based on zoom level
 * @param {number} zoom - Map zoom level
 * @returns {number} Grid size in degrees
 */
function getGridSize(zoom) {
  if (zoom < 10) return 0.1;       // ~11km
  if (zoom < 12) return 0.01;      // ~1.1km
  if (zoom < 14) return 0.005;     // ~550m
  return 0.001;                     // ~110m
}

/**
 * GET / — Returns property clusters for a bounding box
 *
 * Query params:
 * - bbox (required): "west,south,east,north"
 * - zoom (required): current map zoom level
 * - assetClass[]: array of asset class IDs
 * - propertyType: comma-separated ATTOM codes
 *
 * Response:
 * {
 *   "clusters": [
 *     { "lng": -97.75, "lat": 30.25, "count": 156, "avgValue": 500000, "totalValue": 78000000 }
 *   ],
 *   "totalProperties": 2450
 * }
 */
router.get('/', async (req, res) => {
  try {
    const { bbox: bboxStr, zoom: zoomStr, assetClass, propertyType } = req.query;

    // Validate bbox
    const bbox = parseBbox(bboxStr);
    if (!bbox) {
      return res.status(400).json({
        error: 'Invalid bbox parameter',
        details: 'Expected format: bbox=west,south,east,north (e.g., bbox=-97.8,30.2,-97.7,30.3)',
      });
    }

    // Validate zoom
    const zoom = parseInt(zoomStr);
    if (isNaN(zoom) || zoom < 0 || zoom > 22) {
      return res.status(400).json({
        error: 'Invalid zoom parameter',
        details: 'zoom must be an integer between 0 and 22',
      });
    }

    const [west, south, east, north] = bbox;
    const gridSize = getGridSize(zoom);

    // Build WHERE conditions (without grid-related params)
    const baseConditions = ['p.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)'];
    const baseParams = [west, south, east, north];
    let nextParamIndex = 5;

    // Asset class filter (builds SQL directly, no params needed)
    if (assetClass) {
      const assetClasses = Array.isArray(assetClass) ? assetClass : [assetClass];
      if (assetClasses.length > 0) {
        const assetCondition = buildAssetClassCondition(assetClasses);
        if (assetCondition) {
          baseConditions.push(assetCondition);
        }
      }
    }

    // Property type filter (ATTOM codes)
    if (propertyType) {
      const codes = String(propertyType).split(',').map(c => c.trim()).filter(Boolean);
      if (codes.length > 0) {
        baseConditions.push(`p.property_use_standardized = ANY($${nextParamIndex}::text[])`);
        baseParams.push(codes);
        nextParamIndex++;
      }
    }

    const whereClause = baseConditions.join(' AND ');

    // Cluster query params: baseParams + gridSize at the end
    const clusterParams = [...baseParams, gridSize];
    const gridParamIndex = clusterParams.length; // gridSize is at this position

    // Cluster aggregation query
    const clusterQuery = `
      SELECT
        ST_X(ST_Centroid(ST_Collect(p.location))) as lng,
        ST_Y(ST_Centroid(ST_Collect(p.location))) as lat,
        COUNT(*) as count,
        AVG(p.tax_assessed_value_total) as avg_value,
        SUM(p.tax_assessed_value_total) as total_value
      FROM properties p
      WHERE ${whereClause}
      GROUP BY ST_SnapToGrid(p.location, $${gridParamIndex})
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    // Total count query (uses baseParams only, no gridSize)
    const totalQuery = `
      SELECT COUNT(*) as total
      FROM properties p
      WHERE ${whereClause}
    `;

    const [clusterResult, totalResult] = await Promise.all([
      pool.query(clusterQuery, clusterParams),
      pool.query(totalQuery, baseParams),
    ]);

    const clusters = clusterResult.rows.map(row => ({
      lng: parseFloat(row.lng),
      lat: parseFloat(row.lat),
      count: parseInt(row.count),
      avgValue: Math.round(parseFloat(row.avg_value) || 0),
      totalValue: parseFloat(row.total_value) || 0,
    }));

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      clusters,
      totalProperties: parseInt(totalResult.rows[0]?.total) || 0,
      gridSize,
      zoom,
    });
  } catch (error) {
    console.error('[Clusters] Query error:', error);
    res.status(500).json({
      error: 'Cluster query failed',
      details: error.message,
    });
  }
});

module.exports = router;
