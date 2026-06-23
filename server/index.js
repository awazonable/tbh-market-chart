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

function loadCookies() {
  const cookiePath = path.join(__dirname, 'cookies.txt');
  if (!fs.existsSync(cookiePath)) return '';
  const raw = fs.readFileSync(cookiePath, 'utf8').trim();
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

async function steamGet(url, params) {
  const cookies = loadCookies();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://steamcommunity.com/market/',
  };
  if (cookies) headers['Cookie'] = cookies;
  const res = await axios.get(url, { params, headers, timeout: 10000 });
  return res.data;
}

app.get('/api/pricehistory', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });
  const cacheKey = `pricehistory:${market_hash_name}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/pricehistory/', {
        appid: APPID, market_hash_name, currency: 1,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/priceoverview', async (req, res) => {
  const { market_hash_name } = req.query;
  if (!market_hash_name) return res.status(400).json({ error: 'market_hash_name required' });
  const cacheKey = `priceoverview:${market_hash_name}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/priceoverview/', {
        appid: APPID, market_hash_name, currency: 1,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/orderbook', async (req, res) => {
  const { item_nameid } = req.query;
  if (!item_nameid) return res.status(400).json({ error: 'item_nameid required' });
  const cacheKey = `orderbook:${item_nameid}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, _cached: true });
  try {
    const data = await enqueue(() =>
      steamGet('https://steamcommunity.com/market/itemordershistogram/', {
        item_nameid, language: 'english', currency: 1, two_factor: 0,
      })
    );
    cache.set(cacheKey, data);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/cache/status', (_req, res) => {
  const keys = cache.keys();
  res.json({ count: keys.length, queue: requestQueue.length, items: keys.map(k => ({ key: k, ttl: cache.getTtl(k) })) });
});

app.delete('/api/cache/:key', (req, res) => {
  cache.del(decodeURIComponent(req.params.key));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[proxy] listening on http://localhost:${PORT}`);
  console.log(`[proxy] cookies.txt: ${fs.existsSync(path.join(__dirname, 'cookies.txt')) ? 'found' : 'NOT found — pricehistory will fail'}`);
});
