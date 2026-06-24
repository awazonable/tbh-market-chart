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
const requestQueue = [];
let queueRunning = false;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Persistent state (watchlist + last-known item prices)
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let persistedState = { watchlist: [], items: {} };

function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      persistedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[state] load failed:', e.message);
  }
}

let saveTimer = null;
function savePersistedState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(persistedState));
    } catch (e) {
      console.error('[state] save failed:', e.message);
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// File-based pricehistory cache — survives server restarts
// ---------------------------------------------------------------------------
const HISTORY_CACHE_FILE = path.join(DATA_DIR, 'pricehistory-cache.json');
let historyFileCache = {};

function loadHistoryCache() {
  try {
    if (fs.existsSync(HISTORY_CACHE_FILE)) {
      historyFileCache = JSON.parse(fs.readFileSync(HISTORY_CACHE_FILE, 'utf8'));
    }
  } catch (e) { console.error('[history-cache] load failed:', e.message); }
}

let historySaveTimer = null;
function persistHistoryCache() {
  clearTimeout(historySaveTimer);
  historySaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(HISTORY_CACHE_FILE, JSON.stringify(historyFileCache));
    } catch (e) { console.error('[history-cache] save failed:', e.message); }
  }, 2000);
}

loadPersistedState();
loadHistoryCache();

// GET /api/state
app.get('/api/state', (_req, res) => res.json(persistedState));

// PUT /api/state/watchlist
app.put('/api/state/watchlist', (req, res) => {
  if (!Array.isArray(req.body.watchlist)) return res.status(400).json({ error: 'watchlist must be array' });
  persistedState.watchlist = req.body.watchlist;
  savePersistedState();
  res.json({ ok: true });
});

// PUT /api/state/items/:id
app.put('/api/state/items/:id', (req, res) => {
  const { id } = req.params;
  persistedState.items[id] = { ...persistedState.items[id], ...req.body };
  savePersistedState();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Steam proxy helpers
// ---------------------------------------------------------------------------

function loadCookies() {
  const cookiePath = path.join(__dirname, 'cookies.txt');
  if (!fs.existsSync(cookiePath)) return '';
  return fs.readFileSync(cookiePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .join('; ');
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
    // Longer delay to avoid Steam rate limiting
    await sleep(2000 + Math.random() * 1000);
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

// ---------------------------------------------------------------------------
// Steam API endpoints
// ---------------------------------------------------------------------------

// GET /api/pricehistory?market_hash_name=...&currency=...
// Includes file-based fallback cache for when Steam rate-limits
app.get('/api/pricehistory', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const currency = req.query.currency || 1;
  const cacheKey = `pricehistory:${market_hash_name}:${currency}`;
  const fileKey = `${market_hash_name}:${currency}`;

  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/pricehistory/', {
        appid: APPID,
        market_hash_name,
        currency,
      })
    );
    if (data.prices && data.prices.length > 0) {
      cache.set(cacheKey, data);
      historyFileCache[fileKey] = data;
      persistHistoryCache();
      return res.json(data);
    }
    // Steam returned empty — try file cache
    if (historyFileCache[fileKey]) {
      cache.set(cacheKey, historyFileCache[fileKey]);
      return res.json({ ...historyFileCache[fileKey], _fileCached: true });
    }
    res.json(data);
  } catch (e) {
    if (historyFileCache[fileKey]) {
      cache.set(cacheKey, historyFileCache[fileKey]);
      return res.json({ ...historyFileCache[fileKey], _fileCached: true });
    }
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

// GET /api/order-data?market_hash_name=...
// Extracts compact order book + icon_url from the SSR listing page HTML.
// Steam (2025+) embeds rgCompactBuyOrders/rgCompactSellOrders in SSR JSON;
// prices are in internal units (÷100 = currency value).
app.get('/api/order-data', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });

  const cacheKey = `orderdata:${market_hash_name}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });

  try {
    const html = await enqueue(() =>
      steamGet(
        `https://steamcommunity.com/market/listings/${APPID}/${encodeURIComponent(market_hash_name)}`,
        {},
        'text'
      )
    );
    const text = String(html);

    const parseCompact = (str) => {
      const nums = str.split(',').map(Number);
      const result = [];
      for (let i = 0; i + 1 < nums.length; i += 2) result.push([nums[i], nums[i + 1]]);
      return result;
    };

    const buyMatch = text.match(/rgCompactBuyOrders[^[]*\[([0-9,]+)\]/);
    const sellMatch = text.match(/rgCompactSellOrders[^[]*\[([0-9,]+)\]/);
    const iconMatch = text.match(/href="(https:\/\/community[^"]+\/economy\/image\/[^"]+)"/);

    if (!buyMatch && !sellMatch) {
      return res.status(404).json({ error: 'order data not found in page' });
    }

    const data = {
      buyOrders: buyMatch ? parseCompact(buyMatch[1]) : [],
      sellOrders: sellMatch ? parseCompact(sellMatch[1]) : [],
      icon_url: iconMatch ? iconMatch[1] + '/64fx64f' : null,
    };
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// GET /api/cookies/status
app.get('/api/cookies/status', (_req, res) => {
  const cookiePath = path.join(__dirname, 'cookies.txt');
  const exists = fs.existsSync(cookiePath);
  const size = exists ? fs.statSync(cookiePath).size : 0;
  res.json({ exists, hasContent: size > 10 });
});

// POST /api/cookies
app.post('/api/cookies', (req, res) => {
  const { cookie } = req.body;
  if (!cookie || typeof cookie !== 'string' || !cookie.trim()) {
    return res.status(400).json({ error: 'cookie string required' });
  }
  try {
    fs.writeFileSync(path.join(__dirname, 'cookies.txt'), cookie.trim(), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cache/status
app.get('/api/cache/status', (_req, res) => {
  const keys = cache.keys();
  res.json({ count: keys.length, queue: requestQueue.length, items: keys.map(k => ({ key: k, ttl: cache.getTtl(k) })) });
});

// DELETE /api/cache/:key
app.delete('/api/cache/:key', (req, res) => {
  cache.del(decodeURIComponent(req.params.key));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[proxy] listening on http://localhost:${PORT}`);
  console.log(`[proxy] cookies.txt: ${fs.existsSync(path.join(__dirname, 'cookies.txt')) ? 'found' : 'NOT found'}`);
  console.log(`[proxy] persisted state: ${persistedState.watchlist.length} watchlist items, ${Object.keys(persistedState.items).length} cached items`);
  console.log(`[proxy] history file cache: ${Object.keys(historyFileCache).length} entries`);
});
