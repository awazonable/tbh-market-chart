import { useState, useEffect } from 'react';
import { WATCHLIST } from '../watchlist.js';

const KEY = 'steam_market_watchlist';
const BASE = '/api';

export function parseMarketUrl(url) {
  const m = url.trim().match(/market\/listings\/\d+\/(.+)/);
  if (!m) return null;
  const name = decodeURIComponent(m[1]);
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return { id, market_hash_name: name };
}

function syncWatchlistToServer(list) {
  fetch(`${BASE}/state/watchlist`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchlist: list }),
  }).catch(() => {});
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

  // On mount: fetch server watchlist; server wins if it has data, otherwise push local to server
  useEffect(() => {
    fetch(`${BASE}/state`)
      .then(r => r.ok ? r.json() : null)
      .then(state => {
        if (state?.watchlist?.length) {
          setList(state.watchlist);
          localStorage.setItem(KEY, JSON.stringify(state.watchlist));
        } else {
          // Server is empty (first run or reset) — push local list to server
          const local = (() => {
            try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : WATCHLIST; }
            catch { return WATCHLIST; }
          })();
          syncWatchlistToServer(local);
        }
      })
      .catch(() => {});
  }, []);

  const persist = (next) => {
    setList(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    syncWatchlistToServer(next);
  };

  const addItem = (parsed) => {
    if (list.find(i => i.market_hash_name === parsed.market_hash_name)) return false;
    persist([...list, parsed]);
    return true;
  };

  const removeItem = (id) => persist(list.filter(i => i.id !== id));

  return { list, addItem, removeItem };
}
