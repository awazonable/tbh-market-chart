import React from 'react';
import { Sparkline } from './Sparkline.jsx';
import { formatPrice } from '../api.js';
import styles from './ItemCard.module.css';

function filterByPeriod(history, period) {
  if (!history || !history.length) return [];
  const now = history[history.length - 1].time;
  const cutoff = period === '1D' ? now - 86400
    : period === '1W' ? now - 86400 * 7
    : now - 86400 * 30;
  return history.filter(d => d.time >= cutoff);
}

export function ItemCard({ item, selected, onClick, onRemove, period = '1W' }) {
  const { market_hash_name, price, median, sales, status, imageUrl, highestBid, history } = item;

  // Primary: median (24h, fresh from priceoverview on every rotation — no cookies needed).
  // When highestBid is also known, average them to reflect both sides of the market.
  const computedPrice = (() => {
    if (highestBid != null && median != null) return (highestBid + median) / 2;
    return median ?? price;
  })();

  // Change % from start → end of selected period using real history
  const filtered = filterByPeriod(history, period);
  const startVal = filtered.length > 1 ? filtered[0].value : null;
  const changePct = startVal != null && computedPrice != null
    ? (computedPrice - startVal) / startVal * 100
    : null;
  const up = changePct === null ? null : changePct >= 0;

  const color = status === 'pending' || status === 'loading' ? 'var(--yellow)'
    : up === null ? '#444'
    : up ? 'var(--green)' : 'var(--red)';
  const priceColor = up === true ? 'var(--green)' : up === false ? 'var(--red)' : 'var(--yellow)';

  const isPending = status === 'pending' || (status === 'loading' && price == null);

  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ''} ${isPending ? styles.pending : ''}`}
      style={{ '--accent': color }}
      onClick={onClick}
    >
      <div className={styles.header}>
        {imageUrl && <img src={imageUrl} className={styles.icon} alt="" />}
        <div className={styles.name} title={market_hash_name}>{market_hash_name}</div>
        {onRemove && (
          <button
            className={styles.removeBtn}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            title="削除"
          >✕</button>
        )}
      </div>

      {isPending ? (
        <>
          <div className={styles.loadingPrice}>⟳ 更新待ち</div>
          <Sparkline history={null} period={period} color="#444" />
          <div className={styles.meta}><span>— cache無し</span></div>
        </>
      ) : (
        <>
          <div className={styles.price} style={{ color: priceColor }}>
            {formatPrice(computedPrice)}
          </div>
          <Sparkline history={history} period={period} color={color} />
          <div className={styles.meta}>
            <span style={{ color }}>
              {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}
            </span>
            <span className={styles.metaRight}>
              {price != null && <span className={styles.lowestHint}>最安{formatPrice(price)}</span>}
              {sales != null ? ` s.${formatNum(sales)}` : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function formatNum(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
