import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPriceOverview, fetchPriceHistory, fetchOrderBook, fetchItemImage, fetchItemNameId, parseSteamPrice, parseHistoryToSeries } from '../api.js';

const ROTATION_INTERVAL = 10 * 60 * 1000; // 10 min full rotation

function calcDelay(total) {
  return Math.floor(ROTATION_INTERVAL / Math.max(total, 1));
}

function makeItem(w) {
  return { ...w, status: 'pending', price: null, prevPrice: null, median: null, sales: null, prevSales: null, updatedAt: null, imageUrl: null, item_nameid: null, history: null, recentPrice: null, highestBid: null };
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

  useEffect(() => {
    watchlistRef.current = watchlist;
  }, [watchlist]);

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

      setItems(prev => prev.map(it => {
        if (it.id !== id) return it;
        return {
          ...it,
          status: 'ok',
          prevPrice: it.median ?? it.price,
          prevSales: it.sales,
          price,
          median: newMedian,
          sales,
          updatedAt: Date.now(),
        };
      }));

      // Lazy-fetch image, pricehistory, and order book if not yet loaded
      setItems(prev => {
        const current = prev.find(i => i.id === id);
        if (!current?.imageUrl) {
          fetchItemImage(w.market_hash_name).then(imageUrl => {
            if (imageUrl) setItems(p => p.map(i => i.id === id ? { ...i, imageUrl } : i));
          });
        }
        if (!current?.history) {
          fetchPriceHistory(w.market_hash_name).then(d => {
            const series = parseHistoryToSeries(d.prices);
            const recentPrice = series.length ? series[series.length - 1].value : null;
            setItems(p => p.map(i => i.id === id ? { ...i, history: series, recentPrice } : i));
          }).catch(() => {});
        }
        if (!current?.item_nameid) {
          fetchItemNameId(w.market_hash_name).then(async item_nameid => {
            if (!item_nameid) return;
            setItems(p => p.map(i => i.id === id ? { ...i, item_nameid } : i));
            try {
              const bookData = await fetchOrderBook(item_nameid);
              const topBid = bookData.buy_order_graph?.[0]?.[0];
              const highestBid = topBid != null ? topBid / 100 : null;
              setItems(p => p.map(i => i.id === id ? { ...i, highestBid } : i));
            } catch {}
          });
        } else if (current.highestBid == null) {
          fetchOrderBook(current.item_nameid).then(bookData => {
            const topBid = bookData.buy_order_graph?.[0]?.[0];
            const highestBid = topBid != null ? topBid / 100 : null;
            setItems(p => p.map(i => i.id === id ? { ...i, highestBid } : i));
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

    // Initial staggered load
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

  const forceUpdate = useCallback((id) => {
    updateItem(id);
  }, [updateItem]);

  return { items, nextUpdateIn, forceUpdate, rotationEnabled, toggleRotation };
}
