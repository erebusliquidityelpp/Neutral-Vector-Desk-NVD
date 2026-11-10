const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const proxyLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
router.use(proxyLimiter);

// No auth required — this proxy only ever relays public market/macro data, never credentials.
// Each route is a fixed upstream host with a constrained path, not a generic "fetch any URL"
// relay, so this can't be used to reach arbitrary internal or third-party hosts (SSRF).

router.get('/binance/*', async (req, res) => {
  const upstreamPath = req.params[0];
  if (!/^[\w./-]+$/.test(upstreamPath)) return res.status(400).json({ error: 'Invalid path.' });
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = `https://api.binance.com/${upstreamPath}${qs}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'Binance upstream request failed.' });
  }
});

router.get('/fred/:series', async (req, res) => {
  if (!process.env.FRED_API_KEY) return res.status(501).json({ error: 'FRED_API_KEY is not configured on this server.' });
  const series = req.params.series;
  if (!/^[A-Za-z0-9_]+$/.test(series)) return res.status(400).json({ error: 'Invalid series id.' });
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=12`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type('application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'FRED upstream request failed.' });
  }
});

router.get('/bls/:series', async (req, res) => {
  const series = req.params.series;
  if (!/^[A-Za-z0-9]+$/.test(series)) return res.status(400).json({ error: 'Invalid series id.' });
  const url = `https://api.bls.gov/publicAPI/v2/timeseries/data/${series}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type('application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'BLS upstream request failed.' });
  }
});

module.exports = router;
