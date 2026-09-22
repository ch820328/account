"use client";

import { useState, useRef, useEffect } from "react";
import { fmt } from "@/lib/format";

export type LinePoint = { label: string; value: number };

/**
 * Dependency-free responsive line chart with an area fill. Values are plain
 * numbers (major units). Dynamically measures container width to prevent text distortion.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(640);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) {
    return <div className="muted" style={{ fontSize: 13 }}>資料不足，尚無法繪製趨勢。</div>;
  }

  const W = containerWidth;
  const H = height;
  const padX = 16;
  const padTop = 16;
  const padBottom = 26;

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

  // Show at most ~8 x labels to avoid crowding.
  const step = Math.ceil(points.length / 8);

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        style={{ display: "block" }}
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
  </div>
);
}

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
  formattedValue?: string;
  subLabel?: string;
};

/** Interactive donut chart with hover effects, center readout, and legend linking. */
export function DonutChart({
  segments,
  size = 180,
  centerLabel,
  centerValue,
  showCenter = true,
  externalHoveredIdx = null,
  onHoverChange,
}: {
  segments: DonutSegment[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  showCenter?: boolean;
  externalHoveredIdx?: number | null;
  onHoverChange?: (idx: number | null) => void;
}) {
  const [internalHoveredIdx, setInternalHoveredIdx] = useState<number | null>(null);
  const hoveredIdx = externalHoveredIdx !== null ? externalHoveredIdx : internalHoveredIdx;

  const setHover = (idx: number | null) => {
    setInternalHoveredIdx(idx);
    onHoverChange?.(idx);
  };

  const validSegments = segments.filter((s) => s.value > 0);
  const total = validSegments.reduce((s, seg) => s + Math.max(0, seg.value), 0);

  if (total <= 0) {
    return <div className="muted" style={{ fontSize: 13 }}>尚無資料。</div>;
  }

  const r = size / 2;
  const stroke = Math.round(size * 0.16);
  const radius = r - stroke / 2 - 4;
  const circ = 2 * Math.PI * radius;

  const activeSeg =
    hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < validSegments.length
      ? validSegments[hoveredIdx]
      : null;
  const activePct = activeSeg ? Math.round((activeSeg.value / total) * 100) : null;

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - r;
    const dy = y - r;
    const dist = Math.hypot(dx, dy);

    // Hit test on the ring (with 8px tolerance)
    const innerBound = radius - stroke / 2 - 6;
    const outerBound = radius + stroke / 2 + 10;
    if (dist >= innerBound && dist <= outerBound) {
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      deg = (deg + 90 + 360) % 360;
      const targetVal = (deg / 360) * total;
      let cum = 0;
      let matchedIdx = 0;
      for (let i = 0; i < validSegments.length; i++) {
        cum += validSegments[i]!.value;
        if (targetVal <= cum) {
          matchedIdx = i;
          break;
        }
      }
      setHover(matchedIdx);
    } else {
      setHover(null);
    }
  };

  let offset = 0;
  const arcs = validSegments.map((seg, i) => {
    const frac = seg.value / total;
    const dash = frac * circ;
    const isHovered = hoveredIdx === i;
    const isOtherHovered = hoveredIdx !== null && !isHovered;
    const currentOffset = offset;
    offset += dash;

    return (
      <circle
        key={seg.label}
        cx={r}
        cy={r}
        r={radius}
        fill="none"
        stroke={seg.color}
        strokeWidth={isHovered ? stroke + 6 : stroke}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={-currentOffset}
        transform={`rotate(-90 ${r} ${r})`}
        style={{
          cursor: "pointer",
          pointerEvents: "stroke",
          transition: "stroke-width 0.18s ease, opacity 0.18s ease, filter 0.18s ease",
          opacity: isOtherHovered ? 0.35 : 1,
          filter: isHovered ? "drop-shadow(0 0 8px rgba(255,255,255,0.35))" : undefined,
        }}
      >
        <title>{`${seg.label}: ${Math.round(frac * 100)}%${seg.formattedValue ? ` (${seg.formattedValue})` : ""}`}</title>
      </circle>
    );
  });

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible", cursor: "pointer" }}
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <circle cx={r} cy={r} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {arcs}

        {showCenter && (
          <g pointerEvents="none">
            {activeSeg ? (
              <>
                <text
                  x={r}
                  y={r - (activeSeg.formattedValue ? 16 : 8)}
                  textAnchor="middle"
                  fontSize={size >= 240 ? 14 : 12}
                  fontWeight={600}
                  fill="#f8fafc"
                >
                  {activeSeg.label}
                </text>
                <text
                  x={r}
                  y={r + (activeSeg.formattedValue ? 8 : 14)}
                  textAnchor="middle"
                  fontSize={size >= 240 ? 24 : 18}
                  fontWeight={700}
                  fontFamily="monospace"
                  fill={activeSeg.color}
                >
                  {activePct}%
                </text>
                {activeSeg.formattedValue && (
                  <text
                    x={r}
                    y={r + 26}
                    textAnchor="middle"
                    fontSize={size >= 240 ? 12 : 11}
                    fontFamily="monospace"
                    fill="var(--muted)"
                  >
                    {activeSeg.formattedValue}
                  </text>
                )}
              </>
            ) : (
              <>
                <text
                  x={r}
                  y={r - 8}
                  textAnchor="middle"
                  fontSize={size >= 240 ? 13 : 11.5}
                  fontWeight={500}
                  fill="var(--muted)"
                >
                  {centerLabel ?? "全年度總計"}
                </text>
                <text
                  x={r}
                  y={r + 14}
                  textAnchor="middle"
                  fontSize={size >= 240 ? 18 : 15}
                  fontWeight={700}
                  fontFamily="monospace"
                  fill="var(--fg)"
                >
                  {centerValue ?? `${Math.round(total).toLocaleString()}`}
                </text>
              </>
            )}
          </g>
        )}
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
        {validSegments.map((seg, i) => {
          const isHovered = hoveredIdx === i;
          const isOtherHovered = hoveredIdx !== null && !isHovered;
          return (
            <div
              key={seg.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                cursor: "pointer",
                padding: "3px 8px",
                borderRadius: 6,
                background: isHovered ? "rgba(255, 255, 255, 0.08)" : "transparent",
                opacity: isOtherHovered ? 0.4 : 1,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: seg.color,
                  flexShrink: 0,
                  boxShadow: isHovered ? `0 0 6px ${seg.color}` : undefined,
                }}
              />
              <span
                style={{
                  color: isHovered ? "var(--fg)" : "var(--muted)",
                  fontWeight: isHovered ? 600 : 400,
                }}
              >
                {seg.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "monospace",
                  fontWeight: isHovered ? 700 : 500,
                  color: isHovered ? seg.color : "inherit",
                }}
              >
                {Math.round((seg.value / total) * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
