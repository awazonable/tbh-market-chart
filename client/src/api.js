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

export async function fetchOrderBook(item_nameid) {
  const r = await fetch(`${BASE}/orderbook?item_nameid=${encodeURIComponent(item_nameid)}`);
  if (!r.ok) throw new Error(`orderbook ${r.status}`);
  return r.json();
}

export async function fetchItemImage(market_hash_name) {
  const r = await fetch(`${BASE}/itemimage?market_hash_name=${encodeURIComponent(market_hash_name)}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.icon_url || null;
}

// Parse Steam price string like "$2.41" or "¥241" → number
export function parseSteamPrice(str) {
  if (!str) return null;
  return parseFloat(str.replace(/[^0-9.]/g, '')) || null;
}

// Convert pricehistory prices array to [{time, value}] for lightweight-charts
// Steam format: [["Jun 22 2025 01: +0", "2.41", "12"], ...]
export function parseHistoryToSeries(prices) {
  if (!Array.isArray(prices)) return [];
  const seen = new Set();
  return prices
    .map(([dateStr, priceStr]) => {
      const d = new Date(dateStr.replace(/ \d+: \+0/, ''));
      const time = Math.floor(d.getTime() / 1000);
      const value = parseFloat(priceStr);
      if (isNaN(time) || isNaN(value)) return null;
      if (seen.has(time)) return null;
      seen.add(time);
      return { time, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}
