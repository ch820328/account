"use client";

import { fmt } from "@/lib/format";

export type LinePoint = { label: string; value: number };

/**
 * Dependency-free responsive line chart with an area fill. Values are plain
 * numbers (major units). Uses a viewBox so it scales to its container width.
 */
export function LineChart({
  points,
  currency,
  height = 180,
  color = "var(--accent)",
}: {
  points: LinePoint[];
  currency: string;
  height?: number;
  color?: string;
}) {
  if (points.length < 2) {
    return <div className="muted" style={{ fontSize: 13 }}>資料不足，尚無法繪製趨勢。</div>;
  }

  const W = 640;
  const H = height;
  const padX = 8;
  const padTop = 12;
  const padBottom = 22;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const x = (i: number) => padX + (innerW * i) / (points.length - 1);
  const y = (v: number) => padTop + innerH - (innerH * (v - min)) / span;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${padTop + innerH} L${x(0)},${padTop + innerH} Z`;

  const zeroInRange = min < 0 && max > 0;
  const zeroY = y(0);

  // Show at most ~6 x labels to avoid crowding.
  const step = Math.ceil(points.length / 6);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
    >
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroInRange && (
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
      )}
      <path d={area} fill="url(#lc-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) =>
        i % step === 0 || i === points.length - 1 ? (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            fontSize={10}
            fill="var(--muted)"
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          >
            {p.label}
          </text>
        ) : null,
      )}
      <title>
        {fmt(BigInt(Math.round(min * 100)), currency)} ~ {fmt(BigInt(Math.round(max * 100)), currency)}
      </title>
    </svg>
  );
}

export type DonutSegment = { label: string; value: number; color: string };

/** Simple donut chart for asset allocation. Values are non-negative numbers. */
export function DonutChart({
  segments,
  size = 160,
}: {
  segments: DonutSegment[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  if (total <= 0) {
    return <div className="muted" style={{ fontSize: 13 }}>尚無資產資料。</div>;
  }

  const r = size / 2;
  const stroke = size * 0.18;
  const radius = r - stroke / 2;
  const circ = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const frac = seg.value / total;
      const dash = frac * circ;
      const el = (
        <circle
          key={seg.label}
          cx={r}
          cy={r}
          r={radius}
          fill="none"
          stroke={seg.color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${r} ${r})`}
        />
      );
      offset += dash;
      return el;
    });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={r} cy={r} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {arcs}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        {segments
          .filter((s) => s.value > 0)
          .map((seg) => (
            <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: seg.color,
                  flexShrink: 0,
                }}
              />
              <span className="muted">{seg.label}</span>
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {Math.round((seg.value / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
