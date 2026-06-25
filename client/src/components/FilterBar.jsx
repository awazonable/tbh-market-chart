import React from 'react';
import styles from './FilterBar.module.css';

export function FilterBar({ items, search, setSearch, sortBy, setSortBy, nextUpdateIn, rotationEnabled, onToggleRotation, sparklinePeriod, setSparklinePeriod }) {
  const sec = Math.ceil(nextUpdateIn / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');

  return (
    <div className={styles.bar}>
      <span className={styles.logo}>Steam Market</span>

      <div className={styles.periodChips}>
        {['1D', '1W', '1M'].map(p => (
          <button
            key={p}
            className={`${styles.periodChip} ${sparklinePeriod === p ? styles.periodChipActive : ''}`}
            onClick={() => setSparklinePeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.search}
          placeholder="🔍 検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.sort}
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          <option value="default">並び替え ▾</option>
          <option value="price_asc">価格 ↑</option>
          <option value="price_desc">価格 ↓</option>
          <option value="change_asc">騰落 ↑</option>
          <option value="change_desc">騰落 ↓</option>
          <option value="name">名前</option>
        </select>
      </div>

      <button
        className={`${styles.rotateBtn} ${rotationEnabled ? styles.rotateBtnOn : styles.rotateBtnOff}`}
        onClick={onToggleRotation}
        title={rotationEnabled ? '自動更新を停止' : '自動更新を開始'}
      >
        {rotationEnabled ? `⟳ ${mm}:${ss}` : '⏸ 停止中'}
      </button>
    </div>
  );
}
