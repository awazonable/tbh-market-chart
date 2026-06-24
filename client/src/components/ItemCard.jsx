import React from 'react';
import { Sparkline } from './Sparkline.jsx';
import { formatPrice } from '../api.js';
import styles from './ItemCard.module.css';

export function ItemCard({ item, selected, onClick, onRemove }) {
  const { market_hash_name, price, prevPrice, median, sales, prevSales, status, imageUrl } = item;

  // Use median (24h median = closer to "recent transaction") as primary display price
  const displayPrice = median ?? price;
  const displayPrevPrice = prevPrice; // prevPrice tracks previous median or lowest
  const change = displayPrice != null && displayPrevPrice != null ? displayPrice - displayPrevPrice : null;
  const changePct = change != null && displayPrevPrice ? (change / displayPrevPrice) * 100 : null;
  const up = change === null ? null : change >= 0;
  const color = status === 'pending' || status === 'loading' ? 'var(--yellow)'
    : up === null ? '#444'
    : up ? 'var(--green)' : 'var(--red)';
  const priceColor = up === true ? 'var(--green)' : up === false ? 'var(--red)' : 'var(--yellow)';

  const salesDiff = sales != null && prevSales != null ? sales - prevSales : null;

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
          <Sparkline price={null} prevPrice={null} color="#444" />
          <div className={styles.meta}><span>— cache無し</span></div>
        </>
      ) : (
        <>
          <div className={styles.price} style={{ color: priceColor }}>
            {formatPrice(displayPrice)}
          </div>
          <Sparkline price={displayPrice} prevPrice={displayPrevPrice} color={color} />
          <div className={styles.meta}>
            <span style={{ color }}>
              {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}
            </span>
            <span className={styles.metaRight}>
              {price != null && median != null && <span className={styles.lowestHint}>最安{formatPrice(price)}</span>}
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
