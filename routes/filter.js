// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Filter Routes
// File: routes/filter.js
//
// POST /api/properties/filter — Main filter endpoint
// GET /api/properties/filter/options — Available filter options
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { filterProperties } = require('../services/filterService');
const {
  ASSET_CLASS_LABELS,
  OWNER_TYPE_CONDITIONS,
  FORECLOSURE_TYPES,
  getAllAssetClassIds,
  getAllOwnerTypeIds,
} = require('../utils/filterMappings');

// ──────────────────────────────────────────────────────────────
// POST /filter — Main filter endpoint
// ──────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      bbox,
      // Property tab
      assetClass,
      lotSizeMin,
      lotSizeMax,
      buildingSizeMin,
      buildingSizeMax,
      yearBuiltMin,
      yearBuiltMax,
      stories,
      // Ownership tab
      ownerType,
      absenteeOnly,
      ownerName,
      // Sales tab
      soldWithinDays,
      salePriceMin,
      salePriceMax,
      armsLengthOnly,
      investorOnly,
      distressedSalesOnly,
      // Financial tab
      ltvMin,
      ltvMax,
      highLtvOnly,
      equityMin,
      equityMax,
      // Risk tab
      hasForeclosure,
      foreclosureType,
      foreclosureFiledDays,
      auctionWithinDays,
      distressScoreMin,
      floodRiskMin,
      inFloodZone,
      // Options
      limit,
    } = req.body;

    // Validate bbox
    if (!bbox || typeof bbox !== 'object') {
      return res.status(400).json({
        error: 'bbox is required',
        details: 'Expected object with west, south, east, north properties',
      });
    }

    const { west, south, east, north } = bbox;
    if ([west, south, east, north].some(v => typeof v !== 'number' || isNaN(v))) {
      return res.status(400).json({
        error: 'Invalid bbox',
        details: 'west, south, east, north must be valid numbers',
      });
    }

    // Build filters object with type coercion
    const filters = {
      bbox: { west, south, east, north },
    };

    // Property tab
    if (Array.isArray(assetClass) && assetClass.length > 0) {
      filters.assetClass = assetClass.filter(a => typeof a === 'string');
    }
    if (lotSizeMin != null) filters.lotSizeMin = parseFloat(lotSizeMin);
    if (lotSizeMax != null) filters.lotSizeMax = parseFloat(lotSizeMax);
    if (buildingSizeMin != null) filters.buildingSizeMin = parseInt(buildingSizeMin);
    if (buildingSizeMax != null) filters.buildingSizeMax = parseInt(buildingSizeMax);
    if (yearBuiltMin != null) filters.yearBuiltMin = parseInt(yearBuiltMin);
    if (yearBuiltMax != null) filters.yearBuiltMax = parseInt(yearBuiltMax);
    if (stories != null) {
      filters.stories = stories === '5+' ? '5+' : parseInt(stories);
    }

    // Ownership tab
    if (Array.isArray(ownerType) && ownerType.length > 0) {
      filters.ownerType = ownerType.filter(o => typeof o === 'string');
    }
    if (absenteeOnly === true) filters.absenteeOnly = true;
    if (ownerName && typeof ownerName === 'string') filters.ownerName = ownerName;

    // Sales tab
    if (soldWithinDays != null) filters.soldWithinDays = parseInt(soldWithinDays);
    if (salePriceMin != null) filters.salePriceMin = parseInt(salePriceMin);
    if (salePriceMax != null) filters.salePriceMax = parseInt(salePriceMax);
    if (armsLengthOnly === false) filters.armsLengthOnly = false;
    if (investorOnly === true) filters.investorOnly = true;
    if (distressedSalesOnly === true) filters.distressedSalesOnly = true;

    // Financial tab
    if (ltvMin != null) filters.ltvMin = parseFloat(ltvMin);
    if (ltvMax != null) filters.ltvMax = parseFloat(ltvMax);
    if (highLtvOnly === true) filters.highLtvOnly = true;
    if (equityMin != null) filters.equityMin = parseInt(equityMin);
    if (equityMax != null) filters.equityMax = parseInt(equityMax);

    // Risk tab
    if (hasForeclosure === true) filters.hasForeclosure = true;
    if (Array.isArray(foreclosureType) && foreclosureType.length > 0) {
      filters.foreclosureType = foreclosureType.filter(f => typeof f === 'string');
    }
    if (foreclosureFiledDays != null) filters.foreclosureFiledDays = parseInt(foreclosureFiledDays);
    if (auctionWithinDays != null) filters.auctionWithinDays = parseInt(auctionWithinDays);
    if (distressScoreMin != null) filters.distressScoreMin = parseInt(distressScoreMin);
    if (floodRiskMin != null) filters.floodRiskMin = parseInt(floodRiskMin);
    if (inFloodZone === true) filters.inFloodZone = true;

    // Execute filter
    const result = await filterProperties(filters, {
      limit: limit ? Math.min(parseInt(limit), 5000) : 5000,
    });

    res.json(result);
  } catch (error) {
    console.error('Filter error:', error);
    res.status(500).json({
      error: 'Filter query failed',
      details: error.message,
    });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /filter/options — Available filter options for frontend
// ──────────────────────────────────────────────────────────────
router.get('/options', (req, res) => {
  res.json({
    assetClasses: getAllAssetClassIds().map(id => ({
      id,
      label: ASSET_CLASS_LABELS[id],
    })),
    ownerTypes: getAllOwnerTypeIds().map(id => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      description: OWNER_TYPE_CONDITIONS[id].description,
    })),
    foreclosureTypes: Object.entries(FORECLOSURE_TYPES).map(([id, label]) => ({
      id,
      label,
    })),
    tabs: {
      active: ['Property', 'Ownership', 'Sales', 'Financial', 'Risk'],
      comingSoon: ['Location', 'Infrastructure', 'Tenants', 'Capital', 'Building'],
    },
  });
});

module.exports = router;
