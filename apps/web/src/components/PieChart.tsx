"use client";

import React, { useState, useMemo } from "react";
import { fmt } from "@/lib/format";
import { currencyExponent } from "@acc/money";

function toMinor(majorVal: number, currency: string): bigint {
  const exp = currencyExponent(currency);
  return BigInt(Math.round(majorVal * 10 ** exp));
}

export interface SubCategoryItem {
  name: string;
  value: number | bigint;
  categoryId?: string | null;
}

export interface ParentCategoryGroup {
  parentName: string;
  parentId?: string | null;
  color?: string;
  items: SubCategoryItem[];
}

export interface HierarchyPieChartProps {
  data: ParentCategoryGroup[];
  title?: string;
  currency?: string;
  size?: number;
  onSelectCategory?: (category: {
    parentName: string;
    subCategoryName?: string;
    categoryId?: string | null;
    categoryIds?: string[];
    totalAmount?: number;
  }) => void;
}

const PARENT_COLORS = [
  "#4DABF7", // Blue (e.g. 孝親與家人)
  "#FF6B6B", // Red / Coral (e.g. 房屋與居住)
  "#51CF66", // Green (e.g. 保險費)
  "#FCC419", // Yellow (e.g. 訂閱與資訊)
  "#CC5DE8", // Purple
  "#FF922B", // Orange
  "#20C997", // Teal
  "#94D82D", // Lime
  "#F06595", // Pink
  "#845EF7", // Indigo
];

function adjustColorLightness(hexColor: string, factor: number): string {
  // Simple tint helper for sub-items
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const num = parseInt(hex, 16);
  let r = (num >> 16) + Math.round(40 * factor);
  let g = ((num >> 8) & 0x00ff) + Math.round(40 * factor);
  let b = (num & 0x0000ff) + Math.round(40 * factor);

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function HierarchyPieChart({
  data,
  title,
  currency = "TWD",
  size = 360,
  onSelectCategory,
}: HierarchyPieChartProps) {
  const [hoveredParentIdx, setHoveredParentIdx] = useState<number | null>(null);
  const [hoveredSubKey, setHoveredSubKey] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Process Parent & Sub Slices
  const processed = useMemo(() => {
    const parentGroups = data
      .map((group, gIdx) => {
        const allItems = group.items
          .map((i) => ({ ...i, numVal: typeof i.value === "bigint" ? Number(i.value) : i.value }))
          .filter((i) => i.numVal >= 0);
        // Sort items with spending first
        allItems.sort((a, b) => b.numVal - a.numVal);
        const parentTotal = allItems.reduce((sum, i) => sum + i.numVal, 0);
        const color = group.color || PARENT_COLORS[gIdx % PARENT_COLORS.length];
        return {
          parentName: group.parentName,
          parentTotal,
          color,
          items: allItems,
          gIdx,
        };
      });

    // Sort parent groups: groups with spending first (descending), then 0-spending groups
    parentGroups.sort((a, b) => b.parentTotal - a.parentTotal);

    const grandTotal = parentGroups.reduce((sum, g) => sum + g.parentTotal, 0);

    let startAngle = -Math.PI / 2; // Start top 12 o'clock

    const parentSlices: any[] = [];
    const subSlices: any[] = [];

    parentGroups.forEach((group) => {
      const parentAngleLength = grandTotal > 0 && group.parentTotal > 0 ? (group.parentTotal / grandTotal) * (Math.PI * 2) : 0;
      const parentEndAngle = startAngle + parentAngleLength;
      const parentPct = grandTotal > 0 && group.parentTotal > 0 ? (group.parentTotal / grandTotal) * 100 : 0;

      parentSlices.push({
        parentName: group.parentName,
        parentTotal: group.parentTotal,
        startAngle,
        endAngle: parentEndAngle,
        pct: parentPct,
        color: group.color,
        gIdx: group.gIdx,
      });

      // Calculate Sub-item Slices inside Parent Angle
      let subStartAngle = startAngle;
      group.items.forEach((subItem, sIdx) => {
        const subAngleLength = group.parentTotal > 0 && subItem.numVal > 0 ? (subItem.numVal / group.parentTotal) * parentAngleLength : 0;
        const subEndAngle = subStartAngle + subAngleLength;
        const subPctOfGrand = grandTotal > 0 && subItem.numVal > 0 ? (subItem.numVal / grandTotal) * 100 : 0;
        const subPctOfParent = group.parentTotal > 0 && subItem.numVal > 0 ? (subItem.numVal / group.parentTotal) * 100 : 0;

        // Generate lighter/darker tint for sub-item
        const subColor = adjustColorLightness(group.color!, (sIdx % 4) * 0.4 - 0.4);

        subSlices.push({
          parentName: group.parentName,
          subName: subItem.name,
          value: subItem.value,
          startAngle: subStartAngle,
          endAngle: subEndAngle,
          subPctOfGrand,
          subPctOfParent,
          color: subColor,
          parentColor: group.color,
          gIdx: group.gIdx,
          key: `${group.parentName}_${subItem.name}`,
        });

        subStartAngle = subEndAngle;
      });

      startAngle = parentEndAngle;
    });

    return { parentGroups, grandTotal, parentSlices, subSlices };
  }, [data]);

  const radius = size / 2;
  const outerRadius = radius - 8; // Outer ring: Parent Categories
  const outerInnerRadius = outerRadius * 0.72;

  const innerOuterRadius = outerInnerRadius - 4; // Inner ring: Sub-items
  const innerRadius = innerOuterRadius * 0.65;

  if (processed.parentGroups.length === 0) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        {title && <h4 style={{ margin: "0 0 12px", color: "var(--fg)" }}>{title}</h4>}
        無支出資料可繪製大類圓餅圖
      </div>
    );
  }

  const activeSub = hoveredSubKey ? processed.subSlices.find((s) => s.key === hoveredSubKey) : null;
  const activeParent = hoveredParentIdx != null ? processed.parentSlices.find((p) => p.gIdx === hoveredParentIdx) : null;

  const toggleExpand = (pName: string) => {
    setExpandedParents((prev) => ({ ...prev, [pName]: !prev[pName] }));
  };

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: "bold" }}>{title}</h4>
          </div>
          <span style={{ fontSize: 14, fontWeight: "bold", color: "var(--expense)" }}>
            總支出: {fmt(toMinor(processed.grandTotal, currency), currency)}
          </span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 32,
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Dual Donut Rings SVG (Outer: Parent, Inner: Sub-items) with Callout Lines */}
        {(() => {
          const padding = 115;
          const viewBoxSize = size + padding * 2;
          const center = viewBoxSize / 2;

          return (
            <div style={{ position: "relative", width: "100%", maxWidth: viewBoxSize, aspectRatio: "1/1", margin: "0 auto" }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} style={{ overflow: "visible" }}>
                <g transform={`translate(${center}, ${center})`}>
              {/* 1. Outer Ring: Parent Categories */}
              {processed.parentSlices.map((pSlice) => {
                if (pSlice.parentTotal <= 0) return null;
                const isHovered = hoveredParentIdx === pSlice.gIdx;
                const rOut = isHovered ? outerRadius + 4 : outerRadius;

                const x1 = rOut * Math.cos(pSlice.startAngle);
                const y1 = rOut * Math.sin(pSlice.startAngle);
                const x2 = rOut * Math.cos(pSlice.endAngle);
                const y2 = rOut * Math.sin(pSlice.endAngle);

                const ix1 = outerInnerRadius * Math.cos(pSlice.endAngle);
                const iy1 = outerInnerRadius * Math.sin(pSlice.endAngle);
                const ix2 = outerInnerRadius * Math.cos(pSlice.startAngle);
                const iy2 = outerInnerRadius * Math.sin(pSlice.startAngle);

                const largeArc = pSlice.endAngle - pSlice.startAngle > Math.PI ? 1 : 0;
                const pathData = `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${outerInnerRadius} ${outerInnerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

                const isDimmed =
                  (hoveredParentIdx != null && hoveredParentIdx !== pSlice.gIdx) ||
                  (hoveredSubKey != null && activeSub?.gIdx !== pSlice.gIdx);

                return (
                  <path
                    key={`parent_${pSlice.gIdx}`}
                    d={pathData}
                    fill={pSlice.color}
                    opacity={isDimmed ? 0.3 : 1}
                    style={{
                      transition: "all 0.2s ease-in-out",
                      cursor: "pointer",
                      stroke: "var(--surface)",
                      strokeWidth: 2,
                    }}
                    onMouseEnter={() => {
                      setHoveredParentIdx(pSlice.gIdx);
                      setHoveredSubKey(null);
                    }}
                    onMouseLeave={() => setHoveredParentIdx(null)}
                  />
                );
              })}

              {/* 2. Inner Ring: Sub-items */}
              {processed.subSlices.map((sSlice) => {
                if (Number(sSlice.value) <= 0) return null;
                const isHovered = hoveredSubKey === sSlice.key || (hoveredParentIdx === sSlice.gIdx && hoveredSubKey == null);
                const rOut = isHovered ? innerOuterRadius + 3 : innerOuterRadius;

                const x1 = rOut * Math.cos(sSlice.startAngle);
                const y1 = rOut * Math.sin(sSlice.startAngle);
                const x2 = rOut * Math.cos(sSlice.endAngle);
                const y2 = rOut * Math.sin(sSlice.endAngle);

                const ix1 = innerRadius * Math.cos(sSlice.endAngle);
                const iy1 = innerRadius * Math.sin(sSlice.endAngle);
                const ix2 = innerRadius * Math.cos(sSlice.startAngle);
                const iy2 = innerRadius * Math.sin(sSlice.startAngle);

                const largeArc = sSlice.endAngle - sSlice.startAngle > Math.PI ? 1 : 0;
                const pathData = `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

                const isDimmed =
                  (hoveredSubKey != null && hoveredSubKey !== sSlice.key) ||
                  (hoveredParentIdx != null && hoveredParentIdx !== sSlice.gIdx);

                return (
                  <path
                    key={`sub_${sSlice.key}`}
                    d={pathData}
                    fill={sSlice.color}
                    opacity={isDimmed ? 0.25 : 0.9}
                    style={{
                      transition: "all 0.2s ease-in-out",
                      cursor: "pointer",
                      stroke: "var(--surface)",
                      strokeWidth: 1.5,
                    }}
                    onMouseEnter={() => {
                      setHoveredSubKey(sSlice.key);
                      setHoveredParentIdx(sSlice.gIdx);
                    }}
                    onMouseLeave={() => {
                      setHoveredSubKey(null);
                      setHoveredParentIdx(null);
                    }}
                  />
                );
              })}

              {/* 3. Outer Callout Indicator Lines & Text Labels */}
              {processed.parentSlices.map((pSlice) => {
                if (pSlice.pct < 2) return null;

                const midAngle = (pSlice.startAngle + pSlice.endAngle) / 2;
                const isRight = Math.cos(midAngle) >= 0;

                // Anchor point on the outer edge of parent slice
                const xAnchor = (outerRadius + 3) * Math.cos(midAngle);
                const yAnchor = (outerRadius + 3) * Math.sin(midAngle);

                // Elbow point extend outwards
                const elbowDist = outerRadius + 22;
                const xElbow = elbowDist * Math.cos(midAngle);
                const yElbow = elbowDist * Math.sin(midAngle);

                // Horizontal extension
                const horizExt = 22;
                const xEnd = xElbow + (isRight ? horizExt : -horizExt);
                const yEnd = yElbow;

                // Text position
                const xText = xEnd + (isRight ? 5 : -5);
                const textAnchor = isRight ? "start" : "end";

                const isDimmed =
                  (hoveredParentIdx != null && hoveredParentIdx !== pSlice.gIdx) ||
                  (hoveredSubKey != null && activeSub?.gIdx !== pSlice.gIdx);

                return (
                  <g key={`callout_${pSlice.gIdx}`} opacity={isDimmed ? 0.25 : 1} style={{ transition: "opacity 0.2s ease" }}>
                    {/* Anchor dot on outer ring */}
                    <circle cx={xAnchor} cy={yAnchor} r={3} fill={pSlice.color} />

                    {/* Polyline indicator */}
                    <polyline
                      points={`${xAnchor},${yAnchor} ${xElbow},${yElbow} ${xEnd},${yEnd}`}
                      stroke={pSlice.color}
                      strokeWidth={1.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.8}
                    />

                    {/* Category Name Label */}
                    <text
                      x={xText}
                      y={yEnd - 4}
                      textAnchor={textAnchor}
                      fill={pSlice.color}
                      fontSize={11}
                      fontWeight="bold"
                    >
                      {pSlice.parentName}
                    </text>

                    {/* Amount Label */}
                    <text
                      x={xText}
                      y={yEnd + 10}
                      textAnchor={textAnchor}
                      fill={pSlice.color}
                      fontSize={10}
                      fontWeight="600"
                      fontFamily="monospace"
                    >
                      {fmt(toMinor(pSlice.parentTotal, currency), currency)} ({pSlice.pct.toFixed(1)}%)
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Center Info Text */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none",
              width: innerRadius * 1.8,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>
              {activeSub ? `${activeSub.parentName} · ${activeSub.subName}` : activeParent ? activeParent.parentName : "總支出金額"}
            </div>
            <div
              style={{
                fontSize: activeSub || activeParent ? 14 : 15,
                fontWeight: "bold",
                color: activeSub ? activeSub.color : activeParent ? activeParent.color : "var(--expense)",
                marginTop: 2,
              }}
            >
              {activeSub
                ? fmt(toMinor(Number(activeSub.value), currency), currency)
                : activeParent
                ? fmt(toMinor(activeParent.parentTotal, currency), currency)
                : fmt(toMinor(processed.grandTotal, currency), currency)}
            </div>
            {(activeSub || activeParent) && (
              <div style={{ fontSize: 11, color: "var(--fg)", fontWeight: 500, marginTop: 2 }}>
                {activeSub
                  ? `${activeSub.subPctOfGrand.toFixed(1)}% (大類占 ${activeSub.subPctOfParent.toFixed(0)}%)`
                  : `占總支出 ${activeParent?.pct.toFixed(1)}%`}
              </div>
            )}
          </div>
        </div>
      );
    })()}

        {/* Hierarchical Legend List (Parent Category + Sub-items) */}
        <div
          style={{
            flex: 1,
            minWidth: 280,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            alignContent: "start",
          }}
        >
          {processed.parentGroups.map((g, gIdx) => {
            const pSlice = processed.parentSlices.find((p) => p.gIdx === g.gIdx)!;
            const isParentHovered = hoveredParentIdx === g.gIdx;
            const isExpanded = expandedParents[g.parentName] ?? true;

            return (
              <div
                key={g.parentName}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: isParentHovered ? "rgba(255,255,255,0.04)" : "var(--surface)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {/* Parent Category Header */}
                <div
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    background: isParentHovered ? "rgba(255,255,255,0.06)" : "transparent",
                    transition: "background 0.2s ease",
                    boxSizing: "border-box",
                  }}
                  onClick={() => toggleExpand(g.parentName)}
                  onMouseEnter={() => {
                    setHoveredParentIdx(g.gIdx);
                    setHoveredSubKey(null);
                  }}
                  onMouseLeave={() => setHoveredParentIdx(null)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minWidth: 0, gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                        overflow: "hidden",
                      }}
                      onClick={(e) => {
                        if (onSelectCategory) {
                          e.stopPropagation();
                          const catIds = g.items.map((i) => i.categoryId).filter(Boolean) as string[];
                          onSelectCategory({
                            parentName: g.parentName,
                            categoryIds: catIds,
                            totalAmount: g.parentTotal,
                          });
                        }
                      }}
                      title={onSelectCategory ? `點擊查看「${g.parentName}」全分類交易明細` : undefined}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: pSlice.color, flexShrink: 0 }} />
                      <strong style={{ fontSize: 14, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {g.parentName}
                      </strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <strong style={{ fontSize: 13, color: "var(--expense)", whiteSpace: "nowrap" }}>
                        {fmt(toMinor(g.parentTotal, currency), currency)}
                      </strong>
                      <span style={{ fontSize: 12, fontWeight: "bold", color: pSlice.color, minWidth: 40, textAlign: "right" }}>
                        {pSlice.pct.toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(g.parentName);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "2px 4px",
                          cursor: "pointer",
                          color: "var(--muted)",
                          fontSize: 10,
                          lineHeight: 1,
                        }}
                        title={isExpanded ? "收合細項" : "展開細項"}
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>

                  {/* Percentage Progress Bar */}
                  <div style={{ height: 3, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, pSlice.pct)}%`, background: pSlice.color, transition: "width 0.3s ease" }} />
                  </div>
                </div>

                {/* Sub-items List */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "8px 12px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "rgba(0,0,0,0.2)",
                      borderTop: "1px solid rgba(255,255,255,0.03)",
                    }}
                  >
                    {g.items.map((sub) => {
                      const subKey = `${g.parentName}_${sub.name}`;
                      const sSlice = processed.subSlices.find((s) => s.key === subKey);
                      const isSubHovered = hoveredSubKey === subKey;

                      return (
                        <div
                          key={sub.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: isSubHovered ? "rgba(255,255,255,0.08)" : "transparent",
                            cursor: onSelectCategory ? "pointer" : "default",
                            transition: "background 0.15s ease",
                            minHeight: 30,
                            boxSizing: "border-box",
                          }}
                          onClick={(e) => {
                            if (onSelectCategory) {
                              e.stopPropagation();
                              onSelectCategory({
                                parentName: g.parentName,
                                subCategoryName: sub.name,
                                categoryId: sub.categoryId,
                                totalAmount: sub.numVal,
                              });
                            }
                          }}
                          title={onSelectCategory ? `點擊彈窗查看「${g.parentName} · ${sub.name}」交易明細` : undefined}
                          onMouseEnter={() => {
                            setHoveredSubKey(subKey);
                            setHoveredParentIdx(g.gIdx);
                          }}
                          onMouseLeave={() => {
                            setHoveredSubKey(null);
                            setHoveredParentIdx(null);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 6, overflow: "hidden" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: sSlice?.color || pSlice.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: isSubHovered ? "var(--fg)" : "var(--muted-fg)", fontWeight: isSubHovered ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {sub.name}
                            </span>
                            {onSelectCategory && isSubHovered && (
                              <span style={{ fontSize: 10, color: "var(--accent)", opacity: 0.8 }}>🔍</span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>
                              {fmt(toMinor(sub.numVal, currency), currency)}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 42, textAlign: "right" }}>
                              {(sSlice?.subPctOfParent ?? 0).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Keep export PieChart interface for backward compatibility
export { HierarchyPieChart as PieChart };
