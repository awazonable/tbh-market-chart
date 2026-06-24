import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import { fetchPriceHistory, fetchOrderData, parseHistoryFull, formatPrice } from '../api.js';
import styles from './ChartDrawer.module.css';

const PERIODS = ['1D', '1W', '1M'];

export function ChartDrawer({ item, onClose, onForceUpdate, onCookieEdit, onOrderData }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const [period, setPeriod] = useState('1W');
  // history = { price: [{time,value}], volume: [{time,value,color}] } | null
  const [history, setHistory] = useState(null);
  const [orderBook, setOrderBook] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const { market_hash_name, price, prevPrice, median, sales, prevSales, imageUrl, highestBid, recentPrice } = item;

  const displayPrice = (() => {
    if (highestBid != null && recentPrice != null) return (highestBid + recentPrice) / 2;
    if (recentPrice != null) return recentPrice;
    if (highestBid != null) return highestBid;
    return median ?? price;
  })();
  const change = displayPrice != null && prevPrice != null ? displayPrice - prevPrice : null;
  const changePct = change != null && prevPrice ? (change / prevPrice) * 100 : null;
  const up = change === null ? null : change >= 0;
  const priceColor = up === true ? 'var(--green)' : up === false ? 'var(--red)' : '#aaa';
  const salesDiff = sales != null && prevSales != null ? sales - prevSales : null;

  // Load price history
  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError(null);
    fetchPriceHistory(market_hash_name)
      .then(data => {
        if (cancelled) return;
        setHistory(parseHistoryFull(data.prices));
      })
      .catch(e => {
        if (cancelled) return;
        setHistoryError(e.message);
        setHistory({ price: [], volume: [] });
      })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [market_hash_name]);

  // Load order book on-demand (not in background rotation)
  useEffect(() => {
    let cancelled = false;
    setOrderBook(null);
    setLoadingBook(true);
    fetchOrderData(market_hash_name)
      .then(data => {
        if (cancelled) return;
        setOrderBook(data);
        if (onOrderData) onOrderData(data);
      })
      .catch(() => { if (!cancelled) setOrderBook(null); })
      .finally(() => { if (!cancelled) setLoadingBook(false); });
    return () => { cancelled = true; };
  }, [market_hash_name]);

  // Initialize chart with price line + volume histogram
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      autoSize: true,
      layout: { background: { color: '#161616' }, textColor: '#888' },
      grid: { vertLines: { color: '#222' }, horzLines: { color: '#222' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2e2e2e', scaleMargins: { top: 0.05, bottom: 0.25 } },
      timeScale: { borderColor: '#2e2e2e', timeVisible: true },
      handleScroll: true,
      handleScale: true,
    });
    const lineSeries = chart.addLineSeries({
      color: '#13a361',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
    });
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    chartInstanceRef.current = chart;
    seriesRef.current = lineSeries;
    volumeSeriesRef.current = volSeries;
    return () => { chart.remove(); };
  }, []); // eslint-disable-line

  // Update series when history or period changes
  useEffect(() => {
    if (!seriesRef.current || !history) return;
    const filteredPrice = filterByPeriod(history.price, period);
    const filteredVol = filterByPeriod(history.volume, period);
    seriesRef.current.setData(filteredPrice);
    if (volumeSeriesRef.current) volumeSeriesRef.current.setData(filteredVol);
    if (chartInstanceRef.current && filteredPrice.length > 0) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [history, period]);

  const handleForceUpdate = useCallback(() => {
    onForceUpdate();
    setLoadingHistory(true);
    fetchPriceHistory(market_hash_name)
      .then(data => { setHistory(parseHistoryFull(data.prices)); })
      .catch(e => setHistoryError(e.message))
      .finally(() => setLoadingHistory(false));
  }, [market_hash_name, onForceUpdate]);

  return (
    <div className={styles.drawer}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {imageUrl && <img src={imageUrl} className={styles.itemIcon} alt="" />}
          <div>
            <div className={styles.itemName}>{market_hash_name}</div>
            <div className={styles.itemMeta}>
              {item.category === 'material' ? '素材' : '装備'}
              {sales != null && <> · sales {sales.toLocaleString()}{salesDiff != null ? ` (+${salesDiff} vs cache)` : ''}</>}
            </div>
          </div>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
      </div>

      {/* Price */}
      <div className={styles.priceRow}>
        <span className={styles.currentPrice} style={{ color: priceColor }}>
          {formatPrice(displayPrice)}
        </span>
        {change != null && (
          <span className={styles.changeLabel} style={{ color: priceColor }}>
            {change >= 0 ? '+' : ''}{formatPrice(change)} ({changePct >= 0 ? '+' : ''}{changePct?.toFixed(1)}%)
          </span>
        )}
        <span className={styles.priceLabel}>{highestBid != null && recentPrice != null ? '買注文↑直近平均' : '中央値24h'}</span>
      </div>

      {/* Period tabs */}
      <div className={styles.periodRow}>
        {PERIODS.map(p => (
          <button
            key={p}
            className={`${styles.periodBtn} ${period === p ? styles.periodActive : ''}`}
            onClick={() => setPeriod(p)}
          >{p}</button>
        ))}
        <button className={styles.refreshBtn} onClick={handleForceUpdate} title="手動更新">
          ⟳ 手動更新
        </button>
      </div>

      {/* Chart */}
      <div className={styles.chartWrap}>
        {loadingHistory && <div className={styles.overlay}>読み込み中...</div>}
        {historyError && !loadingHistory && (
          <div className={styles.overlay} style={{ color: 'var(--red)' }}>
            エラー: {historyError}<br />
            <small style={{ color: '#666' }}>Steam Cookieが必要です</small>
            {onCookieEdit && (
              <button
                onClick={onCookieEdit}
                style={{ marginTop: 10, background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', fontSize: 11, borderRadius: 2, cursor: 'pointer' }}
              >
                🍪 Cookie更新
              </button>
            )}
          </div>
        )}
        <div ref={chartRef} className={styles.chart} />
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <span>中央値 {formatPrice(median)}</span>
        <span>最安値 {formatPrice(price)}</span>
        {price != null && median != null && (
          <span style={{ color: '#a066cc' }}>spread {formatPrice(median - price)}</span>
        )}
      </div>

      {/* Order book */}
      <div className={styles.orderBook}>
        <div className={styles.bookHeader}>
          <span>Buy / Sell 板</span><span>qty</span>
        </div>
        {loadingBook ? (
          <div className={styles.bookLoading}>読み込み中...</div>
        ) : orderBook ? (
          <OrderBookRows data={orderBook} />
        ) : (
          <div className={styles.bookLoading}>板情報なし</div>
        )}
      </div>
    </div>
  );
}

// data = { buyOrders: [[priceInternal, qty], ...], sellOrders: [[...]] }
// buyOrders: highest bid first; sellOrders: lowest ask first
// priceInternal / 100 = currency value
function OrderBookRows({ data }) {
  const sells = (data.sellOrders || []).slice(0, 5);
  const buys = (data.buyOrders || []).slice(0, 5);

  const maxQty = Math.max(
    ...sells.map(r => r[1] || 0),
    ...buys.map(r => r[1] || 0),
    1
  );

  return (
    <>
      {[...sells].reverse().map(([p, qty], i) => (
        <BookRow key={`s${i}`} price={p} qty={qty} maxQty={maxQty} side="sell" />
      ))}
      <div className={styles.spreadRow}>── spread ──</div>
      {buys.map(([p, qty], i) => (
        <BookRow key={`b${i}`} price={p} qty={qty} maxQty={maxQty} side="buy" />
      ))}
    </>
  );
}

function BookRow({ price, qty, maxQty, side }) {
  const pct = Math.min(100, (qty / maxQty) * 100);
  const color = side === 'sell' ? 'var(--red)' : 'var(--green)';
  const barColor = side === 'sell' ? '#d23b3b55' : '#13a36155';
  return (
    <div className={styles.bookRow}>
      <span className={styles.bookPrice} style={{ color }}>{formatPrice(price / 100)}</span>
      <div className={styles.bookBar}>
        {side === 'sell'
          ? <div style={{ width: `${pct}%`, height: '8px', background: barColor, marginLeft: 'auto' }} />
          : <div style={{ width: `${pct}%`, height: '8px', background: barColor }} />
        }
      </div>
      <span className={styles.bookQty} style={{ color }}>{qty}</span>
    </div>
  );
}

function filterByPeriod(data, period) {
  if (!data || !data.length) return [];
  const now = data[data.length - 1].time;
  const cutoff = {
    '1D': now - 86400,
    '1W': now - 86400 * 7,
    '1M': now - 86400 * 30,
  }[period] ?? 0;
  return data.filter(d => d.time >= cutoff);
}
