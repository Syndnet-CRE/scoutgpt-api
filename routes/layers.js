const express = require('express');
const router = express.Router();
const layerService = require('../services/layerService');
const { parseBbox } = require('../utils/normalize');

router.get('/parcels', async (req, res) => {
  try {
    const bbox = parseBbox(req.query.bbox);
    if (!bbox) return res.status(400).json({ error: 'bbox parameter required. Format: minLng,minLat,maxLng,maxLat' });
    const geojson = await layerService.getParcelBoundaries(bbox, parseInt(req.query.limit) || 5000);
    res.json(geojson);
  } catch (error) {
    console.error('Error getting parcel boundaries:', error);
    res.status(500).json({ error: 'Failed to get parcel boundaries', details: error.message });
  }
});

router.get('/flood', async (req, res) => {
  try {
    const bbox = parseBbox(req.query.bbox);
    if (!bbox) return res.status(400).json({ error: 'bbox parameter required. Format: minLng,minLat,maxLng,maxLat' });
    const geojson = await layerService.getFloodZones(bbox, parseInt(req.query.limit) || 2000);
    res.json(geojson);
  } catch (error) {
    console.error('Error getting flood zones:', error);
    res.status(500).json({ error: 'Failed to get flood zones', details: error.message });
  }
});

router.get('/schools', async (req, res) => {
  try {
    const bbox = parseBbox(req.query.bbox);
    if (!bbox) return res.status(400).json({ error: 'bbox parameter required. Format: minLng,minLat,maxLng,maxLat' });
    const geojson = await layerService.getSchoolDistricts(bbox, parseInt(req.query.limit) || 500);
    res.json(geojson);
  } catch (error) {
    console.error('Error getting school districts:', error);
    res.status(500).json({ error: 'Failed to get school districts', details: error.message });
  }
});

module.exports = router;
