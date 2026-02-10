const express = require('express');
const router = express.Router();
const propertyService = require('../services/propertyService');
const { parseBbox } = require('../utils/normalize');

router.get('/', async (req, res) => {
  try {
    const { bbox: bboxStr, limit, ...filterParams } = req.query;
    const bbox = parseBbox(bboxStr);
    if (!bbox) {
      return res.status(400).json({ error: 'bbox parameter required. Format: minLng,minLat,maxLng,maxLat' });
    }

    const filters = {};
    const booleanFilters = ['absenteeOwner', 'ownerOccupied', 'corporateOwned', 'foreclosure', 'taxDelinquent', 'recentSales', 'highEquity'];
    for (const key of booleanFilters) {
      if (filterParams[key] === 'true') filters[key] = true;
    }
    if (filterParams.propertyType) filters.propertyType = filterParams.propertyType;
    if (filterParams.zipCode) filters.zipCode = filterParams.zipCode;
    if (filterParams.minAcres) filters.minAcres = parseFloat(filterParams.minAcres);
    if (filterParams.maxAcres) filters.maxAcres = parseFloat(filterParams.maxAcres);
    if (filterParams.minValue) filters.minValue = parseFloat(filterParams.minValue);
    if (filterParams.maxValue) filters.maxValue = parseFloat(filterParams.maxValue);

    const properties = await propertyService.searchProperties({ bbox, filters, limit: parseInt(limit) || 500 });
    res.json({ count: properties.length, properties });
  } catch (error) {
    console.error('Error searching properties:', error);
    res.status(500).json({ error: 'Failed to search properties', details: error.message });
  }
});

module.exports = router;
