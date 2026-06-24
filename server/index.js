const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const APPID = 3678970;
const CACHE_TTL = 600; // 10 min

const cache = new NodeCache({ stdTTL: CACHE_TTL });
const imageCache = new NodeCache({ stdTTL: 86400 }); // 24h — icons don't change
const nameIdCache = new NodeCache({ stdTTL: 0 }); // permanent — item_nameid never changes
const requestQueue = [];
let queueRunning = false;

app.use(cors());
app.use(express.json());

// Load cookies from cookies.txt (Netscape format or raw header string)
function loadCookies() {
  const cookiePath = path.join(__dirname, 'cookies.txt');
  if (!fs.existsSync(cookiePath)) return '';
  const raw = fs.readFileSync(cookiePath, 'utf8').trim();
  // If it looks like a raw cookie header string, use as-is
  if (raw.startsWith('steamLoginSecure') || raw.includes('=')) return raw;
  return raw;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (requestQueue.length > 0) {
    const task = requestQueue.shift();
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (e) {
      task.reject(e);
    }
    const delay = 1000 + Math.random() * 500;
    await sleep(delay);
  }
  queueRunning = false;
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

async function steamGet(url, params, responseType = 'json') {
  const cookies = loadCookies();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://steamcommunity.com/market/',
  };
  if (cookies) headers['Cookie'] = cookies;
  const res = await axios.get(url, { params, headers, timeout: 10000, responseType });
  return res.data;
}

// GET /api/pricehistory?market_hash_name=...
app.get('/api/pricehistory', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const cacheKey = `pricehistory:${market_hash_name}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/pricehistory/', {
        appid: APPID,
        market_hash_name,
        currency: req.query.currency || 1,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/priceoverview?market_hash_name=...&currency=...
app.get('/api/priceoverview', async (req, res) => {
  const { market_hash_name, currency = '1' } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const cacheKey = `priceoverview:${market_hash_name}:${currency}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/priceoverview/', {
        appid: APPID,
        market_hash_name,
        currency,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/item_nameid?market_hash_name=...
// Fetches the Steam market listing page and extracts the item_nameid used for order book
app.get('/api/item_nameid', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const key = `nameid:${market_hash_name}`;
  const cached = nameIdCache.get(key);
  if (cached !== undefined) return res.json({ item_nameid: cached });

  try {
    const html = await enqueue(() =>
      steamGet(
        `https://steamcommunity.com/market/listings/${APPID}/${encodeURIComponent(market_hash_name)}`,
        {},
        'text'
      )
    );
    const m = String(html).match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
    if (!m) return res.status(404).json({ error: 'item_nameid not found in page' });
    nameIdCache.set(key, m[1]);
    res.json({ item_nameid: m[1] });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/itemimage?market_hash_name=...
app.get('/api/itemimage', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const key = `img:${market_hash_name}`;
  const cached = imageCache.get(key);
  if (cached !== undefined) return res.json(cached);

  try {
    const data = await steamGet('https://steamcommunity.com/market/search/render/', {
      appid: APPID,
      query: market_hash_name,
      count: 1,
      search_descriptions: 0,
      format: 'json',
    });
    const icon = data?.results?.[0]?.asset_description?.icon_url ?? null;
    const result = icon
      ? { icon_url: `https://community.akamai.steamstatic.com/economy/image/${icon}/64fx64f` }
      : { icon_url: null };
    imageCache.set(key, result);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/orderbook?item_nameid=...&currency=...
app.get('/api/orderbook', async (req, res) => {
  const { item_nameid, currency = '8' } = req.query;
  if (!item_nameid) return res.status(400).json({ error: 'item_nameid required' });

  const cacheKey = `orderbook:${item_nameid}:${currency}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/itemordershistogram/', {
        item_nameid,
        language: 'english',
        currency,
        two_factor: 0,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/cache/status — show cache keys and TTLs
app.get('/api/cache/status', (_req, res) => {
  const keys = cache.keys();
  const status = keys.map(k => ({ key: k, ttl: cache.getTtl(k) }));
  res.json({ count: keys.length, queue: requestQueue.length, items: status });
});

// DELETE /api/cache/:key — force invalidate
app.delete('/api/cache/:key', (req, res) => {
  cache.del(decodeURIComponent(req.params.key));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[proxy] listening on http://localhost:${PORT}`);
  console.log(`[proxy] cookies.txt: ${fs.existsSync(path.join(__dirname, 'cookies.txt')) ? 'found' : 'NOT found — pricehistory will fail'}`);
});
