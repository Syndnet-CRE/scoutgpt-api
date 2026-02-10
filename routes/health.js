const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const dbResult = await pool.query('SELECT NOW() as time, current_database() as database');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        name: dbResult.rows[0].database,
        time: dbResult.rows[0].time,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: { connected: false, error: error.message },
    });
  }
});

module.exports = router;
