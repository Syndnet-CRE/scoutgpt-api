// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Heatmap Route
// File: routes/heatmap.js
//
// GET /api/properties/heatmap — Returns aggregated values for heatmap rendering
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

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

// Valid metrics that can be aggregated
const VALID_METRICS = {
  tax_assessed_value_total: {
    table: 'properties',
    column: 'p.tax_assessed_value_total',
    label: 'Assessed Value',
  },
  available_equity: {
    table: 'property_valuations',
    column: 'pv.available_equity',
    label: 'Available Equity',
  },
  ltv: {
    table: 'property_valuations',
    column: 'pv.ltv',
    label: 'Loan-to-Value',
  },
};

/**
 * GET / — Returns heatmap cells for a bounding box
 *
 * Query params:
 * - bbox (required): "west,south,east,north"
 * - metric (required): "tax_assessed_value_total" | "available_equity" | "ltv"
 * - resolution: grid size in degrees (default 0.002)
 *
 * Response:
 * {
 *   "cells": [
 *     { "lng": -97.75, "lat": 30.25, "value": 12500000, "count": 25 }
 *   ],
 *   "metric": "tax_assessed_value_total",
 *   "bounds": { "min": 100000, "max": 5000000 }
 * }
 */
router.get('/', async (req, res) => {
  try {
    const { bbox: bboxStr, metric, resolution: resStr } = req.query;

    // Validate bbox
    const bbox = parseBbox(bboxStr);
    if (!bbox) {
      return res.status(400).json({
        error: 'Invalid bbox parameter',
        details: 'Expected format: bbox=west,south,east,north (e.g., bbox=-97.8,30.2,-97.7,30.3)',
      });
    }

    // Validate metric
    if (!metric || !VALID_METRICS[metric]) {
      return res.status(400).json({
        error: 'Invalid metric parameter',
        details: `metric must be one of: ${Object.keys(VALID_METRICS).join(', ')}`,
      });
    }

    const metricConfig = VALID_METRICS[metric];
    const [west, south, east, north] = bbox;
    const resolution = parseFloat(resStr) || 0.002;

    // Validate resolution
    if (resolution <= 0 || resolution > 1) {
      return res.status(400).json({
        error: 'Invalid resolution parameter',
        details: 'resolution must be between 0 and 1 degrees',
      });
    }

    // Build query based on metric
    const needsValuationsJoin = metricConfig.table === 'property_valuations';

    const params = [west, south, east, north, resolution];

    // Heatmap query with grid aggregation
    // Use ST_SnapToGrid center point + half resolution for cell center
    const query = `
      SELECT
        ST_X(ST_SnapToGrid(p.location, $5)) + $5/2 as lng,
        ST_Y(ST_SnapToGrid(p.location, $5)) + $5/2 as lat,
        AVG(${metricConfig.column}) as avg_value,
        COUNT(*) as count
      FROM properties p
      ${needsValuationsJoin ? `
        LEFT JOIN LATERAL (
          SELECT available_equity, ltv
          FROM property_valuations
          WHERE attom_id = p.attom_id
          ORDER BY valuation_date DESC
          LIMIT 1
        ) pv ON true
      ` : ''}
      WHERE p.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ${needsValuationsJoin ? `AND ${metricConfig.column} IS NOT NULL` : ''}
      GROUP BY ST_SnapToGrid(p.location, $5)
      HAVING COUNT(*) > 0
    `;

    // Bounds query for min/max values
    const boundsQuery = `
      SELECT
        MIN(${metricConfig.column}) as min_value,
        MAX(${metricConfig.column}) as max_value
      FROM properties p
      ${needsValuationsJoin ? `
        LEFT JOIN LATERAL (
          SELECT available_equity, ltv
          FROM property_valuations
          WHERE attom_id = p.attom_id
          ORDER BY valuation_date DESC
          LIMIT 1
        ) pv ON true
      ` : ''}
      WHERE p.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        ${needsValuationsJoin ? `AND ${metricConfig.column} IS NOT NULL` : ''}
    `;

    const [cellsResult, boundsResult] = await Promise.all([
      pool.query(query, params),
      pool.query(boundsQuery, params.slice(0, 4)),
    ]);

    const cells = cellsResult.rows
      .filter(row => row.avg_value != null)
      .map(row => ({
        lng: parseFloat(row.lng),
        lat: parseFloat(row.lat),
        value: parseFloat(row.avg_value),
        count: parseInt(row.count),
      }));

    const bounds = {
      min: parseFloat(boundsResult.rows[0]?.min_value) || 0,
      max: parseFloat(boundsResult.rows[0]?.max_value) || 0,
    };

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      cells,
      metric,
      metricLabel: metricConfig.label,
      resolution,
      bounds,
    });
  } catch (error) {
    console.error('[Heatmap] Query error:', error);
    res.status(500).json({
      error: 'Heatmap query failed',
      details: error.message,
    });
  }
});

module.exports = router;
