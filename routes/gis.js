const express = require('express');
const router = express.Router();
const { getGisLayer } = require('../services/gisService');

function parseBbox(bboxParam) {
  if (!bboxParam) {
    return null;
  }

  const parts = bboxParam.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) {
    return null;
  }

  const [west, south, east, north] = parts;

  if (west < -180 || west > 180 || east < -180 || east > 180) {
    return null;
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    return null;
  }
  if (west > east || south > north) {
    return null;
  }

  return [west, south, east, north];
}

async function handleGisRequest(req, res, layerType) {
  const bbox = parseBbox(req.query.bbox);
  if (!bbox) {
    return res.status(400).json({
      error: 'Invalid bbox parameter',
      expected: 'bbox=west,south,east,north (e.g., bbox=-97.8,30.2,-97.7,30.3)',
    });
  }

  try {
    const featureCollection = await getGisLayer(layerType, bbox);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(featureCollection);
  } catch (err) {
    console.error(`GIS ${layerType} error:`, err);
    res.status(500).json({ error: 'Failed to fetch GIS data' });
  }
}

router.get('/water', (req, res) => handleGisRequest(req, res, 'water'));
router.get('/sewer', (req, res) => handleGisRequest(req, res, 'sewer'));
router.get('/storm', (req, res) => handleGisRequest(req, res, 'storm'));
router.get('/zoning', (req, res) => handleGisRequest(req, res, 'zoning'));
router.get('/flood', (req, res) => handleGisRequest(req, res, 'flood'));

module.exports = router;
