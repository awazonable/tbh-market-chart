const BASE = '/api';

const CURRENCY_OPTIONS = {
  8: { symbol: '¥', decimals: 0 },
  1: { symbol: '$', decimals: 2 },
};

export function getCurrencyCode() {
  return parseInt(localStorage.getItem('tbh_currency') ?? '8', 10);
}

export function setCurrencyCode(code) {
  localStorage.setItem('tbh_currency', String(code));
}

export function getCurrencyInfo() {
  return CURRENCY_OPTIONS[getCurrencyCode()] ?? CURRENCY_OPTIONS[8];
}

export function formatPrice(value) {
  if (value == null) return '—';
  const { symbol, decimals } = getCurrencyInfo();
  return `${symbol}${value.toFixed(decimals)}`;
}

export async function fetchPriceOverview(market_hash_name) {
  const currency = getCurrencyCode();
  const r = await fetch(`${BASE}/priceoverview?market_hash_name=${encodeURIComponent(market_hash_name)}&currency=${currency}`);
  if (!r.ok) throw new Error(`priceoverview ${r.status}`);
  return r.json();
}

export async function fetchPriceHistory(market_hash_name) {
  const currency = getCurrencyCode();
  const r = await fetch(`${BASE}/pricehistory?market_hash_name=${encodeURIComponent(market_hash_name)}&currency=${currency}`);
  if (!r.ok) throw new Error(`pricehistory ${r.status}`);
  return r.json();
}

// Extracts compact order book + icon_url from listing page HTML (no item_nameid needed).
// Returns { buyOrders: [[priceInternal, qty], ...], sellOrders: [...], icon_url }
// Prices are in internal Steam units; divide by 100 to get currency value.
export async function fetchOrderData(market_hash_name) {
  const r = await fetch(`${BASE}/order-data?market_hash_name=${encodeURIComponent(market_hash_name)}`);
  if (!r.ok) throw new Error(`order-data ${r.status}`);
  return r.json();
}

// Parse Steam price string like "$2.41" or "¥241" → number
export function parseSteamPrice(str) {
  if (!str) return null;
  return parseFloat(str.replace(/[^0-9.]/g, '')) || null;
}

// Convert pricehistory prices array to [{time, value}] for lightweight-charts
// Steam format: [["Jun 22 2025 01: +0", "2.41", "12"], ...]
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

function parseDateStr(dateStr) {
  const m = String(dateStr).match(/^(\w{3}) +(\d+) +(\d{4}) +(\d+): \+0/);
  if (!m) return null;
  const mo = MONTHS[m[1]];
  if (mo === undefined) return null;
  return Math.floor(Date.UTC(+m[3], mo, +m[2], +m[4], 0, 0) / 1000);
}

export function parseHistoryToSeries(prices) {
  if (!Array.isArray(prices)) return [];
  const seen = new Set();
  return prices
    .map(([dateStr, priceStr]) => {
      const time = parseDateStr(dateStr);
      const value = parseFloat(priceStr);
      if (!time || isNaN(value) || seen.has(time)) return null;
      seen.add(time);
      return { time, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

// Returns { price: [{time,value}], volume: [{time,value,color}] }
// Used by ChartDrawer to render price line + volume histogram together.
export function parseHistoryFull(prices) {
  if (!Array.isArray(prices)) return { price: [], volume: [] };
  const seen = new Set();
  const price = [], volume = [];
  for (const entry of prices) {
    const [dateStr, priceStr, volStr] = entry;
    const time = parseDateStr(dateStr);
    const value = parseFloat(priceStr);
    const vol = parseFloat(volStr) || 0;
    if (!time || isNaN(value) || seen.has(time)) continue;
    seen.add(time);
    price.push({ time, value });
    volume.push({ time, value: vol });
  }
  price.sort((a, b) => a.time - b.time);
  volume.sort((a, b) => a.time - b.time);
  // Color bars: green if price rose vs previous point, red if fell
  for (let i = 0; i < volume.length; i++) {
    const up = i === 0 || price[i].value >= price[i - 1].value;
    volume[i] = { ...volume[i], color: up ? '#13a36155' : '#d23b3b55' };
  }
  return { price, volume };
}
