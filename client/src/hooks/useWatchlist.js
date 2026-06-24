import { useState } from 'react';
import { WATCHLIST } from '../watchlist.js';

const KEY = 'tbh_watchlist';

export function parseMarketUrl(url) {
  const m = url.trim().match(/market\/listings\/\d+\/(.+)/);
  if (!m) return null;
  const name = decodeURIComponent(m[1]);
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return { id, market_hash_name: name, category: 'material' };
}

export function useWatchlist() {
  const [list, setList] = useState(() => {
    try {
      const s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : WATCHLIST;
    } catch {
      return WATCHLIST;
    }
  });

  const persist = (next) => {
    setList(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const addItem = (parsed) => {
    if (list.find(i => i.market_hash_name === parsed.market_hash_name)) return false;
    persist([...list, parsed]);
    return true;
  };

  const removeItem = (id) => persist(list.filter(i => i.id !== id));

  return { list, addItem, removeItem };
}
