import React from 'react';

function filterByPeriod(history, period) {
  if (!history || !history.length) return [];
  const now = history[history.length - 1].time;
  const cutoff = period === '1D' ? now - 86400
    : period === '1W' ? now - 86400 * 7
    : now - 86400 * 30;
  return history.filter(d => d.time >= cutoff);
}

export function Sparkline({ history, period = '1W', color = '#444', height = 30 }) {
  const width = 120;
  const data = filterByPeriod(history, period);

  if (!data.length) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline
          points={`0,${height / 2} ${width},${height / 2}`}
          fill="none"
          stroke="#444"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      </svg>
    );
  }

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const n = data.length;

  const toX = (i) => n === 1 ? width / 2 : (i / (n - 1)) * width;
  const toY = (v) => height - pad - ((v - min) / range) * (height - pad * 2);

  const points = data.map((d, i) => `${toX(i).toFixed(1)},${toY(d.value).toFixed(1)}`).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
