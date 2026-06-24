import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import { fetchPriceHistory, fetchOrderBook, parseHistoryToSeries, formatPrice, getCurrencyInfo } from '../api.js';
import styles from './ChartDrawer.module.css';

const PERIODS = ['1D', '1W', '1M'];

export function ChartDrawer({ item, onClose, onForceUpdate }) {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRef = useRef(null);
  const [period, setPeriod] = useState('1W');
  const [history, setHistory] = useState(null);
  const [orderBook, setOrderBook] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingBook, setLoadingBook] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const { market_hash_name, price, prevPrice, median, sales, prevSales, status, imageUrl } = item;
  // Show median as primary (recent market price); fall back to lowest if median unavailable
  const displayPrice = median ?? price;
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
        const series = parseHistoryToSeries(data.prices);
        setHistory(series);
      })
      .catch(e => {
        if (cancelled) return;
        setHistoryError(e.message);
        setHistory([]);
      })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [market_hash_name]);

  // Load order book — item_nameid is auto-fetched by useMarketData and stored in item
  useEffect(() => {
    if (!item.item_nameid) { setOrderBook(null); return; }
    let cancelled = false;
    setLoadingBook(true);
    fetchOrderBook(item.item_nameid)
      .then(data => { if (!cancelled) setOrderBook(data); })
      .catch(() => { if (!cancelled) setOrderBook(null); })
      .finally(() => { if (!cancelled) setLoadingBook(false); });
    return () => { cancelled = true; };
  }, [item.item_nameid]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = createChart(chartRef.current, {
      layout: { background: { color: '#161616' }, textColor: '#888' },
      grid: { vertLines: { color: '#222' }, horzLines: { color: '#222' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2e2e2e' },
      timeScale: { borderColor: '#2e2e2e', timeVisible: true },
      handleScroll: true,
      handleScale: true,
    });
    const lineSeries = chart.addLineSeries({
      color: up === false ? 'var(--red)' : '#13a361',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
    });
    chartInstanceRef.current = chart;
    seriesRef.current = lineSeries;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
      }
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []); // eslint-disable-line

  // Update series when history or period changes
  useEffect(() => {
    if (!seriesRef.current || !history) return;
    const filtered = filterByPeriod(history, period);
    seriesRef.current.setData(filtered);
    if (chartInstanceRef.current && filtered.length > 0) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [history, period]);

  const handleForceUpdate = useCallback(() => {
    onForceUpdate();
    // Also reload chart data
    setLoadingHistory(true);
    fetchPriceHistory(market_hash_name)
      .then(data => { setHistory(parseHistoryToSeries(data.prices)); })
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
        <span className={styles.priceLabel}>中央値24h</span>
      </div>

      {/* Period tabs */}
      <div className={styles.periodRow}>
        {PERIODS.map(p => (
          <button
            key={p}
            className={`${styles.periodBtn} ${period === p ? styles.periodActive : ''}`}
            onClick={() => setPeriod(p)}
          >
            {p}
          </button>
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
            <small>cookies.txt にSteam Cookieを設定してください</small>
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
        {item.item_nameid ? (
          loadingBook ? <div className={styles.bookLoading}>読み込み中...</div> :
          orderBook ? <OrderBookRows data={orderBook} /> :
          <div className={styles.bookLoading}>板情報なし</div>
        ) : (
          <div className={styles.bookLoading}>板情報読み込み中...</div>
        )}
      </div>
    </div>
  );
}

function OrderBookRows({ data }) {
  const sells = (data.sell_order_graph || []).slice(0, 5).reverse();
  const buys = (data.buy_order_graph || []).slice(0, 5);

  const maxQty = Math.max(
    ...sells.map(r => r[1] || 0),
    ...buys.map(r => r[1] || 0),
    1
  );

  return (
    <>
      {sells.map(([price, qty], i) => (
        <BookRow key={`s${i}`} price={price} qty={qty} maxQty={maxQty} side="sell" />
      ))}
      <div className={styles.spreadRow}>spread ～</div>
      {buys.map(([price, qty], i) => (
        <BookRow key={`b${i}`} price={price} qty={qty} maxQty={maxQty} side="buy" />
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
      <span className={styles.bookPrice} style={{ color }}>{typeof price === 'number' ? formatPrice(price / 100) : price}</span>
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
  if (!data.length) return data;
  const now = data[data.length - 1].time;
  const cutoff = {
    '1D': now - 86400,
    '1W': now - 86400 * 7,
    '1M': now - 86400 * 30,
  }[period] ?? 0;
  return data.filter(d => d.time >= cutoff);
}
