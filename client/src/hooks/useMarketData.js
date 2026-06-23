import { useState, useEffect, useRef, useCallback } from 'react';
import { WATCHLIST } from '../watchlist.js';
import { fetchPriceOverview, parseSteamPrice } from '../api.js';

const ROTATION_INTERVAL = 10 * 60 * 1000;

function calcDelay(total) {
  return Math.floor(ROTATION_INTERVAL / total);
}

export function useMarketData() {
  const [items, setItems] = useState(() =>
    WATCHLIST.map(w => ({ ...w, status: 'pending', price: null, prevPrice: null, sales: null, prevSales: null, updatedAt: null }))
  );
  const [nextUpdateIn, setNextUpdateIn] = useState(0);
  const rotationRef = useRef(0);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const activeRef = useRef(true);

  const updateItem = useCallback(async (index) => {
    const w = WATCHLIST[index];
    setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'loading' } : it));
    try {
      const data = await fetchPriceOverview(w.market_hash_name);
      const price = parseSteamPrice(data.lowest_price);
      const sales = data.volume ? parseInt(data.volume.replace(/,/g, ''), 10) : null;
      setItems(prev => prev.map((it, i) => {
        if (i !== index) return it;
        return { ...it, status: 'ok', prevPrice: it.price, prevSales: it.sales, price, median: parseSteamPrice(data.median_price), sales, updatedAt: Date.now() };
      }));
    } catch {
      setItems(prev => prev.map((it, i) => i === index ? { ...it, status: 'error' } : it));
    }
  }, []);

  useEffect(() => {
    const delay = calcDelay(WATCHLIST.length);

    const tick = () => {
      if (!activeRef.current) return;
      const idx = rotationRef.current % WATCHLIST.length;
      rotationRef.current += 1;
      updateItem(idx);
      setNextUpdateIn(delay);
      timerRef.current = setTimeout(tick, delay);
    };

    WATCHLIST.forEach((_, i) => setTimeout(() => updateItem(i), i * 1200));
    const firstDelay = WATCHLIST.length * 1200 + 2000;
    timerRef.current = setTimeout(tick, firstDelay);
    setNextUpdateIn(firstDelay);

    let remaining = firstDelay;
    countdownRef.current = setInterval(() => {
      remaining = Math.max(0, remaining - 1000);
      setNextUpdateIn(remaining);
    }, 1000);

    const onVisibility = () => { activeRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countdownRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [updateItem]);

  const forceUpdate = useCallback((index) => { updateItem(index); }, [updateItem]);

  return { items, nextUpdateIn, forceUpdate };
}
