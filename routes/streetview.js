const express = require('express');
const router = express.Router();
const { getStreetViewImage } = require('../services/streetviewService');

router.get('/property/:attomId/streetview', async (req, res) => {
  try {
    const { attomId } = req.params;

    if (!attomId) {
      return res.status(400).json({ error: 'attomId is required' });
    }

    const data = await getStreetViewImage(attomId);
    res.json(data);
  } catch (err) {
    console.error('[StreetView Route] Error:', err.message);

    if (err.message === 'Property not found') {
      return res.status(404).json({ error: 'Property not found' });
    }

    if (err.message === 'Property has no coordinates') {
      return res.status(404).json({ error: 'Property has no coordinates' });
    }

    res.status(500).json({ error: 'Failed to fetch street view image' });
  }
});

module.exports = router;
