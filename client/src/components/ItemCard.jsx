import React from 'react';
import { Sparkline } from './Sparkline.jsx';
import styles from './ItemCard.module.css';

export function ItemCard({ item, selected, onClick }) {
  const { market_hash_name, price, prevPrice, sales, prevSales, status } = item;
  const change = price != null && prevPrice != null ? price - prevPrice : null;
  const changePct = change != null && prevPrice ? (change / prevPrice) * 100 : null;
  const up = change === null ? null : change >= 0;
  const color = (status === 'pending' || status === 'loading') ? 'var(--yellow)'
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
      <div className={styles.name} title={market_hash_name}>{market_hash_name}</div>
      {isPending ? (
        <>
          <div className={styles.loadingPrice}>⟳ 更新待ち</div>
          <Sparkline price={null} prevPrice={null} color="#444" />
          <div className={styles.meta}><span>— cache無し</span></div>
        </>
      ) : (
        <>
          <div className={styles.price} style={{ color: priceColor }}>
            {price != null ? `$${price.toFixed(2)}` : '—'}
          </div>
          <Sparkline price={price} prevPrice={prevPrice} color={color} />
          <div className={styles.meta}>
            <span style={{ color }}>{changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'}</span>
            <span>
              {sales != null ? `s.${formatNum(sales)}` : ''}
              {salesDiff != null && salesDiff !== 0 ? ` ${salesDiff > 0 ? '+' : ''}${salesDiff}↑` : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function formatNum(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
