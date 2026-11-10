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

// Tradier and Polygon.io: the user's OWN market-data key, supplied per-request via the
// x-provider-key header, never stored server-side. This exists only to route around
// browser CORS — the upstream host is hardcoded, so this can't be used as an open relay.
router.get('/tradier/*', async (req, res) => {
  const token = req.get('x-provider-key');
  if (!token) return res.status(400).json({ error: 'Missing x-provider-key header (your Tradier access token).' });
  const upstreamPath = req.params[0];
  if (!/^[\w./-]+$/.test(upstreamPath)) return res.status(400).json({ error: 'Invalid path.' });
  const env = req.query.env === 'production' ? 'api' : 'sandbox';
  const qs = (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '').replace(/[?&]env=(sandbox|production)/, '');
  const url = `https://${env}.tradier.com/${upstreamPath}${qs}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'Tradier upstream request failed.' });
  }
});

router.get('/polygon/*', async (req, res) => {
  const key = req.get('x-provider-key');
  if (!key) return res.status(400).json({ error: 'Missing x-provider-key header (your Polygon.io API key).' });
  const upstreamPath = req.params[0];
  if (!/^[\w./-]+$/.test(upstreamPath)) return res.status(400).json({ error: 'Invalid path.' });
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const sep = qs ? '&' : '?';
  const url = `https://api.polygon.io/${upstreamPath}${qs}${sep}apiKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: 'Polygon.io upstream request failed.' });
  }
});

// --- Free/public RSS news aggregation -------------------------------------------------
// No API key, no paywall: this fetches real RSS feeds from real news publishers
// server-side (their hosts don't send CORS headers, so the browser can't fetch them
// directly) and returns parsed JSON. Fixed allowlist of named feeds only — never an
// open "fetch any URL" relay, same pattern as the routes above.
const RSS_FEEDS = {
  cointelegraph: { url: 'https://cointelegraph.com/rss', source: 'Cointelegraph' },
  coindesk: { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml', source: 'CoinDesk' },
  marketwatch_top: { url: 'https://feeds.marketwatch.com/marketwatch/topstories', source: 'MarketWatch' },
  marketwatch_bulletins: { url: 'https://feeds.marketwatch.com/marketwatch/bulletins', source: 'MarketWatch' },
  seekingalpha: { url: 'https://seekingalpha.com/feed.xml', source: 'Seeking Alpha' },
  investing_stocks: { url: 'https://www.investing.com/rss/news_25.rss', source: 'Investing.com' },
  investing_forex: { url: 'https://www.investing.com/rss/news_1.rss', source: 'Investing.com' },
  investing_economy: { url: 'https://www.investing.com/rss/news_14.rss', source: 'Investing.com' },
  investing_indicators: { url: 'https://www.investing.com/rss/news_95.rss', source: 'Investing.com' },
  investing_earnings: { url: 'https://www.investing.com/rss/news_1062.rss', source: 'Investing.com' },
  investing_crypto: { url: 'https://www.investing.com/rss/news_301.rss', source: 'Investing.com' }
};

function rssExtractTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return '';
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1].trim();
  return v;
}
function rssDecodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, '').trim();
}
function parseRssXml(xml, source) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 20) {
    const block = m[1];
    const title = rssExtractTag(block, 'title');
    const link = rssExtractTag(block, 'link');
    const pubDate = rssExtractTag(block, 'pubDate') || rssExtractTag(block, 'dc:date') || rssExtractTag(block, 'published');
    if (title) items.push({ title: rssDecodeEntities(title), link: link.trim(), pubDate: pubDate.trim(), source });
  }
  return items;
}
async function fetchRssFeed(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    if (!r.ok) return { ok: false, error: `Upstream returned ${r.status}`, items: [] };
    const xml = await r.text();
    return { ok: true, source: feed.source, items: parseRssXml(xml, feed.source) };
  } catch (e) {
    return { ok: false, error: 'Upstream request failed.', items: [] };
  }
}

router.get('/rss/:feedId', async (req, res) => {
  const feed = RSS_FEEDS[req.params.feedId];
  if (!feed) return res.status(400).json({ error: 'Unknown feed id.' });
  res.json(await fetchRssFeed(feed));
});

// Fetch several named feeds in parallel and return them together — the frontend uses
// this one route per news category so it can merge 2+ real, independent publishers.
router.get('/rss-multi/:feedIds', async (req, res) => {
  const ids = req.params.feedIds.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
  const results = await Promise.all(ids.map(async (id) => {
    const feed = RSS_FEEDS[id];
    if (!feed) return { id, ok: false, error: 'Unknown feed id.', items: [] };
    const r = await fetchRssFeed(feed);
    return { id, ...r };
  }));
  res.json({ results });
});

module.exports = router;
