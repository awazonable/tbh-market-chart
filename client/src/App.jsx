import React, { useState, useMemo } from 'react';
import { FilterBar } from './components/FilterBar.jsx';
import { ItemCard } from './components/ItemCard.jsx';
import { ChartDrawer } from './components/ChartDrawer.jsx';
import { useMarketData } from './hooks/useMarketData.js';
import { WATCHLIST } from './watchlist.js';
import styles from './App.module.css';

export default function App() {
  const { items, nextUpdateIn, forceUpdate } = useMarketData();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selectedId, setSelectedId] = useState(null);

  const selectedItem = selectedId != null ? items.find(it => it.id === selectedId) : null;

  const visibleItems = useMemo(() => {
    let list = items;
    if (filter !== 'all') list = list.filter(it => it.category === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(it => it.market_hash_name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc':   return (a.price ?? Infinity) - (b.price ?? Infinity);
        case 'price_desc':  return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case 'change_asc':  return (pctChange(a) ?? -Infinity) - (pctChange(b) ?? -Infinity);
        case 'change_desc': return (pctChange(b) ?? -Infinity) - (pctChange(a) ?? -Infinity);
        case 'name':        return a.market_hash_name.localeCompare(b.market_hash_name);
        default:            return 0;
      }
    });
    return list;
  }, [items, filter, search, sortBy]);

  const drawerOpen = selectedItem != null;

  return (
    <div className={styles.app}>
      <FilterBar
        items={items}
        filter={filter} setFilter={setFilter}
        search={search} setSearch={setSearch}
        sortBy={sortBy} setSortBy={setSortBy}
        nextUpdateIn={nextUpdateIn}
      />
      <div className={`${styles.body} ${drawerOpen ? styles.withDrawer : ''}`}>
        <div className={`${styles.grid} ${drawerOpen ? styles.gridDimmed : ''}`}>
          {visibleItems.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)}
            />
          ))}
          <div className={styles.addCard} onClick={() => alert('watchlist.js を編集してアイテムを追加してください')}>
            + 追加
          </div>
        </div>
        {drawerOpen && (
          <ChartDrawer
            item={selectedItem}
            onClose={() => setSelectedId(null)}
            onForceUpdate={() => {
              const idx = WATCHLIST.findIndex(w => w.id === selectedId);
              if (idx >= 0) forceUpdate(idx);
            }}
          />
        )}
      </div>
      <div className={styles.statusBar}>
        … スクロールで残り表示 · 自動ローテ中 · 非アクティブで停止
      </div>
    </div>
  );
}

function pctChange(item) {
  if (item.price == null || item.prevPrice == null) return null;
  return (item.price - item.prevPrice) / item.prevPrice * 100;
}
