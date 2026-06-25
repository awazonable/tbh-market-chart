import React, { useState, useMemo } from 'react';
import { FilterBar } from './components/FilterBar.jsx';
import { ItemCard } from './components/ItemCard.jsx';
import { ChartDrawer } from './components/ChartDrawer.jsx';
import { CookieModal } from './components/CookieModal.jsx';
import { useMarketData } from './hooks/useMarketData.js';
import { useWatchlist, parseMarketUrl } from './hooks/useWatchlist.js';
import styles from './App.module.css';

export default function App() {
  const { list: watchlist, addItem, removeItem } = useWatchlist();
  const { items, nextUpdateIn, forceUpdate, rotationEnabled, toggleRotation, applyOrderData } = useMarketData(watchlist);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selectedId, setSelectedId] = useState(null);
  const [sparklinePeriod, setSparklinePeriod] = useState('1W');
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [addError, setAddError] = useState('');

  const selectedItem = selectedId != null ? items.find(it => it.id === selectedId) : null;

  const visibleItems = useMemo(() => {
    let list = items;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(it => it.market_hash_name.toLowerCase().includes(q));
    }

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'price_asc': return (computeDisplayPrice(a) ?? Infinity) - (computeDisplayPrice(b) ?? Infinity);
        case 'price_desc': return (computeDisplayPrice(b) ?? -Infinity) - (computeDisplayPrice(a) ?? -Infinity);
        case 'change_asc': {
          const ca = pctChange(a), cb = pctChange(b);
          return (ca ?? -Infinity) - (cb ?? -Infinity);
        }
        case 'change_desc': {
          const ca = pctChange(a), cb = pctChange(b);
          return (cb ?? -Infinity) - (ca ?? -Infinity);
        }
        case 'name': return a.market_hash_name.localeCompare(b.market_hash_name);
        default: return 0;
      }
    });

    return list;
  }, [items, search, sortBy]);

  const drawerOpen = selectedItem != null;

  const handleAddUrl = () => {
    const parsed = parseMarketUrl(urlInput);
    if (!parsed) { setAddError('URLの形式が正しくありません'); return; }
    const ok = addItem(parsed);
    if (!ok) { setAddError('すでに登録済みです'); return; }
    setUrlInput('');
    setAddMode(false);
    setAddError('');
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') handleAddUrl();
    if (e.key === 'Escape') { setAddMode(false); setUrlInput(''); setAddError(''); }
  };

  return (
    <div className={styles.app}>
      <FilterBar
        items={items}
        search={search}
        setSearch={setSearch}
        sortBy={sortBy}
        setSortBy={setSortBy}
        nextUpdateIn={nextUpdateIn}
        rotationEnabled={rotationEnabled}
        onToggleRotation={toggleRotation}
        sparklinePeriod={sparklinePeriod}
        setSparklinePeriod={setSparklinePeriod}
      />

      <div className={`${styles.body} ${drawerOpen ? styles.withDrawer : ''}`}>
        <div className={`${styles.gridWrap} ${drawerOpen ? styles.gridDimmed : ''}`}>
          {addMode && (
            <div className={styles.addPanel}>
              <input
                className={styles.addInput}
                placeholder="Steam Market URL を貼り付け..."
                value={urlInput}
                onChange={e => { setUrlInput(e.target.value); setAddError(''); }}
                onKeyDown={handleAddKeyDown}
                autoFocus
              />
              <button className={styles.addBtn} onClick={handleAddUrl}>追加</button>
              <button className={styles.cancelBtn} onClick={() => { setAddMode(false); setUrlInput(''); setAddError(''); }}>✕</button>
              {addError && <span className={styles.addError}>{addError}</span>}
            </div>
          )}
          <div className={styles.grid}>
            {visibleItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)}
                onRemove={() => {
                  removeItem(item.id);
                  if (selectedId === item.id) setSelectedId(null);
                }}
                period={sparklinePeriod}
              />
            ))}
            <div
              className={styles.addCard}
              onClick={() => setAddMode(m => !m)}
            >
              + 追加
            </div>
          </div>
        </div>

        {drawerOpen && (
          <ChartDrawer
            item={selectedItem}
            onClose={() => setSelectedId(null)}
            onForceUpdate={() => forceUpdate(selectedId)}
            onCookieEdit={() => setCookieModalOpen(true)}
            onOrderData={(data) => applyOrderData(selectedId, data)}
          />
        )}
      </div>

      <div className={styles.statusBar}>
        <span>… スクロールで残り表示 · {rotationEnabled ? '自動ローテ中' : '更新停止中'} · 非アクティブで停止</span>
        <button className={styles.cookieBtn} onClick={() => setCookieModalOpen(true)} title="Steam Cookie 更新">
          🍪 Cookie更新
        </button>
      </div>

      {cookieModalOpen && <CookieModal onClose={() => setCookieModalOpen(false)} />}
    </div>
  );
}

function computeDisplayPrice(item) {
  const { highestBid, recentPrice, median, price } = item;
  if (highestBid != null && recentPrice != null) return (highestBid + recentPrice) / 2;
  if (recentPrice != null) return recentPrice;
  if (highestBid != null) return highestBid;
  return median ?? price;
}

function pctChange(item) {
  const cur = computeDisplayPrice(item);
  if (cur == null || item.prevPrice == null) return null;
  return (cur - item.prevPrice) / item.prevPrice * 100;
}
