const express = require('express');
const router = express.Router();
const propertyService = require('../services/propertyService');

router.get('/:attomId', async (req, res) => {
  try {
    const { attomId } = req.params;
    if (!attomId) return res.status(400).json({ error: 'attomId parameter required' });

    const property = await propertyService.getPropertyDetail(attomId);
    if (!property) return res.status(404).json({ error: 'Property not found', attomId });

    res.json(property);
  } catch (error) {
    console.error('Error getting property detail:', error);
    res.status(500).json({ error: 'Failed to get property detail', details: error.message });
  }
});

module.exports = router;
