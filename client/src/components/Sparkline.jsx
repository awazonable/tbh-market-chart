import React from 'react';

export function Sparkline({ price, prevPrice, color, width = 120, height = 30 }) {
  const points = generatePoints(price, prevPrice, width, height);
  if (!points) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline points={`0,${height/2} ${width},${height/2}`} fill="none" stroke="#444" strokeWidth="1.5" strokeDasharray="4 4" />
      </svg>
    );
  }
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function generatePoints(price, prevPrice, w, h) {
  if (price == null) return null;
  const p0 = prevPrice ?? price;
  const p1 = price;
  const min = Math.min(p0, p1) * 0.995;
  const max = Math.max(p0, p1) * 1.005;
  const range = max - min || 1;
  const toY = v => h - ((v - min) / range) * (h * 0.8) - h * 0.1;
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const noise = (Math.sin(i * 2.3 + 1.1) * 0.3 + Math.cos(i * 1.7) * 0.2) * range * 0.15;
    pts.push(`${(i / 7) * w},${toY(p0 + (p1 - p0) * t + noise)}`);
  }
  pts.push(`${w},${toY(p1)}`);
  return pts.join(' ');
}
