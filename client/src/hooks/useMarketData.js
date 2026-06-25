import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPriceOverview, fetchPriceHistory, parseSteamPrice, parseHistoryToSeries } from '../api.js';

const ROTATION_INTERVAL = 10 * 60 * 1000; // 10 min full rotation
const BASE = '/api';

function calcDelay(total) {
  return Math.floor(ROTATION_INTERVAL / Math.max(total, 1));
}

function makeItem(w) {
  const { id, market_hash_name } = w;
  return {
    id, market_hash_name,
    status: 'pending',
    price: null, prevPrice: null,
    median: null, sales: null, prevSales: null,
    updatedAt: null,
    imageUrl: null,
    history: null, recentPrice: null,
    highestBid: null,
  };
}

function saveItemToServer(id, data) {
  fetch(`${BASE}/state/items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {});
}

export function useMarketData(watchlist) {
  const [items, setItems] = useState(() => watchlist.map(makeItem));
  const [nextUpdateIn, setNextUpdateIn] = useState(0);
  const [rotationEnabled, setRotationEnabled] = useState(true);

  const rotationRef = useRef(0);
  const rotationEnabledRef = useRef(true);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const activeRef = useRef(true);
  const watchlistRef = useRef(watchlist);
  const nextUpdateAtRef = useRef(0);

  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  // Hydrate from server-persisted state on mount
  useEffect(() => {
    fetch(`${BASE}/state`)
      .then(r => r.ok ? r.json() : null)
      .then(state => {
        if (!state?.items) return;
        setItems(prev => prev.map(it => {
          const c = state.items[it.id];
          if (!c) return it;
          return {
            ...it,
            status: c.price != null ? 'ok' : it.status,
            price: c.price ?? it.price,
            median: c.median ?? it.median,
            sales: c.sales ?? it.sales,
            recentPrice: c.recentPrice ?? it.recentPrice,
            highestBid: c.highestBid ?? it.highestBid,
            imageUrl: c.imageUrl ?? it.imageUrl,
            updatedAt: c.updatedAt ?? it.updatedAt,
          };
        }));
      })
      .catch(() => {});
  }, []);

  // Sync items when watchlist changes (add/remove)
  useEffect(() => {
    setItems(prev => {
      const prevMap = new Map(prev.map(i => [i.id, i]));
      return watchlist.map(w => prevMap.get(w.id) ?? makeItem(w));
    });
  }, [watchlist]);

  const updateItem = useCallback(async (id) => {
    const wl = watchlistRef.current;
    const w = wl.find(i => i.id === id);
    if (!w) return;

    setItems(prev => prev.map(it => it.id === id ? { ...it, status: 'loading' } : it));
    try {
      const data = await fetchPriceOverview(w.market_hash_name);
      const price = parseSteamPrice(data.lowest_price);
      const sales = data.volume ? parseInt(data.volume.replace(/,/g, ''), 10) : null;
      const newMedian = parseSteamPrice(data.median_price);
      const updatedAt = Date.now();

      setItems(prev => prev.map(it => {
        if (it.id !== id) return it;
        return { ...it, status: 'ok', prevPrice: it.median ?? it.price, prevSales: it.sales, price, median: newMedian, sales, updatedAt };
      }));
      saveItemToServer(id, { price, median: newMedian, sales, updatedAt });

      // Lazy-fetch price history if not yet loaded
      setItems(prev => {
        const current = prev.find(i => i.id === id);
        if (!current?.history) {
          fetchPriceHistory(w.market_hash_name).then(d => {
            const series = parseHistoryToSeries(d.prices);
            const recentPrice = series.length ? series[series.length - 1].value : null;
            setItems(p => p.map(i => i.id === id ? { ...i, history: series, recentPrice } : i));
            if (recentPrice != null) saveItemToServer(id, { recentPrice });
          }).catch(() => {});
        }
        return prev;
      });
    } catch {
      setItems(prev => prev.map(it => it.id === id ? { ...it, status: 'error' } : it));
    }
  }, []);

  const toggleRotation = useCallback(() => {
    const next = !rotationEnabledRef.current;
    rotationEnabledRef.current = next;
    setRotationEnabled(next);
  }, []);

  useEffect(() => {
    const getDelay = () => calcDelay(watchlistRef.current.length);

    const tick = () => {
      if (!activeRef.current || !rotationEnabledRef.current) return;
      const wl = watchlistRef.current;
      if (!wl.length) return;
      const id = wl[rotationRef.current % wl.length].id;
      rotationRef.current += 1;
      updateItem(id);
      const delay = getDelay();
      nextUpdateAtRef.current = Date.now() + delay;
      timerRef.current = setTimeout(tick, delay);
    };

    watchlist.forEach((w, i) => {
      setTimeout(() => updateItem(w.id), i * 1200);
    });

    const firstDelay = watchlist.length * 1200 + 2000;
    nextUpdateAtRef.current = Date.now() + firstDelay;
    timerRef.current = setTimeout(tick, firstDelay);

    countdownRef.current = setInterval(() => {
      if (rotationEnabledRef.current) {
        setNextUpdateIn(Math.max(0, nextUpdateAtRef.current - Date.now()));
      }
    }, 500);

    const onVisibility = () => { activeRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line

  const forceUpdate = useCallback((id) => { updateItem(id); }, [updateItem]);

  // Called from ChartDrawer after it fetches order-data on-demand.
  // Propagates icon_url and highestBid back into global item state.
  const applyOrderData = useCallback((id, data) => {
    const topBid = data.buyOrders?.[0]?.[0];
    const highestBid = topBid != null ? topBid / 100 : null;
    const imageUrl = data.icon_url ?? null;
    const patch = {};
    if (highestBid != null) patch.highestBid = highestBid;
    if (imageUrl) patch.imageUrl = imageUrl;
    if (Object.keys(patch).length) {
      setItems(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
      saveItemToServer(id, patch);
    }
  }, []);

  return { items, nextUpdateIn, forceUpdate, rotationEnabled, toggleRotation, applyOrderData };
}
