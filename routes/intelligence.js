// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — CRE Intelligence Routes
// File: routes/intelligence.js
//
// Drop into ~/scoutgpt-api/routes/
// Wire into server.js:  app.use('/api', require('./routes/intelligence'));
//
// NEW ENDPOINTS:
//   GET  /api/property/:attomId/intelligence   — Full derived metrics + scores
//   GET  /api/property/:attomId/comps          — Comparable sales (PostGIS spatial)
//   GET  /api/property/:attomId/portfolio      — Owner's other properties
//   GET  /api/owners/top                       — Top portfolio owners
//   GET  /api/properties/distressed            — Distressed property search
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const {
  getPropertyIntelligence,
  getComparableSales,
  getOwnerPortfolio,
  getTopPortfolioOwners,
  getDistressedProperties,
} = require('../services/intelligenceService');

// ──────────────────────────────────────────────────────────────
// GET /api/property/:attomId/intelligence
// Returns all 15 derived metrics + 3 composite scores for a property
// ──────────────────────────────────────────────────────────────
router.get('/property/:attomId/intelligence', async (req, res) => {
  try {
    const { attomId } = req.params;
    if (!attomId || isNaN(attomId)) {
      return res.status(400).json({ error: 'Valid attomId required' });
    }

    const intelligence = await getPropertyIntelligence(parseInt(attomId));
    if (!intelligence) {
      return res.status(404).json({ error: 'Property not found' });
    }

    res.json(intelligence);
  } catch (err) {
    console.error('[Intelligence] Error:', err.message);
    res.status(500).json({ error: 'Failed to compute property intelligence', details: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/property/:attomId/comps
// Returns top comparable sales with similarity scoring
// Query params: radius (miles), months, limit
// ──────────────────────────────────────────────────────────────
router.get('/property/:attomId/comps', async (req, res) => {
  try {
    const { attomId } = req.params;
    if (!attomId || isNaN(attomId)) {
      return res.status(400).json({ error: 'Valid attomId required' });
    }

    const options = {
      radiusMiles: parseFloat(req.query.radius) || 3,
      monthsBack: parseInt(req.query.months) || 24,
      limit: Math.min(parseInt(req.query.limit) || 5, 20),
      sfTolerance: parseFloat(req.query.sfTolerance) || 0.3,
      yearTolerance: parseInt(req.query.yearTolerance) || 15,
    };

    const comps = await getComparableSales(parseInt(attomId), options);
    res.json(comps);
  } catch (err) {
    console.error('[Comps] Error:', err.message);
    res.status(500).json({ error: 'Failed to find comparable sales', details: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/property/:attomId/portfolio
// Returns all properties owned by the same owner
// ──────────────────────────────────────────────────────────────
router.get('/property/:attomId/portfolio', async (req, res) => {
  try {
    const { attomId } = req.params;
    if (!attomId || isNaN(attomId)) {
      return res.status(400).json({ error: 'Valid attomId required' });
    }

    const portfolio = await getOwnerPortfolio(parseInt(attomId));
    res.json(portfolio);
  } catch (err) {
    console.error('[Portfolio] Error:', err.message);
    res.status(500).json({ error: 'Failed to find owner portfolio', details: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/owners/top
// Returns top portfolio owners ranked by property count
// Query params: minProperties, limit
// ──────────────────────────────────────────────────────────────
router.get('/owners/top', async (req, res) => {
  try {
    const options = {
      minProperties: parseInt(req.query.minProperties) || 5,
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
    };

    const owners = await getTopPortfolioOwners(options);
    res.json({ owners, count: owners.length });
  } catch (err) {
    console.error('[TopOwners] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch top owners', details: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/properties/distressed
// Returns properties ranked by distress score
// Query params: minScore, limit, bbox (west,south,east,north)
// ──────────────────────────────────────────────────────────────
router.get('/properties/distressed', async (req, res) => {
  try {
    const options = {
      minScore: parseInt(req.query.minScore) || 30,
      limit: Math.min(parseInt(req.query.limit) || 50, 200),
    };

    if (req.query.bbox) {
      const [west, south, east, north] = req.query.bbox.split(',').map(Number);
      if ([west, south, east, north].some(isNaN)) {
        return res.status(400).json({ error: 'Invalid bbox format. Use: west,south,east,north' });
      }
      options.bbox = { west, south, east, north };
    }

    const results = await getDistressedProperties(options);
    res.json({ properties: results, count: results.length });
  } catch (err) {
    console.error('[Distressed] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch distressed properties', details: err.message });
  }
});

module.exports = router;
