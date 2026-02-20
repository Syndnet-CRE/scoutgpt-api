require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { loadRegistry } = require('./services/registryService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

app.use('/api/health', require('./routes/health'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/properties/filter', require('./routes/filter'));
app.use('/api/property', require('./routes/property'));
app.use('/api', require('./routes/intelligence'));
app.use('/api/layers', require('./routes/layers'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api', require('./routes/streetview'));
app.use('/api/gis', require('./routes/gis'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

(async () => {
  // Load filters registry
  try {
    await loadRegistry();
    console.log('[STARTUP] Filters registry loaded');
  } catch (err) {
    console.error('[STARTUP] Failed to load filters registry:', err.message);
    // Non-fatal: API can still run with existing NLQ pipeline
  }

  app.listen(PORT, () => {
    console.log(`ScoutGPT API running on port ${PORT}`);
  });
})();
