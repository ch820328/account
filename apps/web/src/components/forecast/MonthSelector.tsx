"use client";

import React from "react";

interface MonthSelectorProps {
  value: string; // comma-separated months, e.g. "2,5,8,11" or "5"
  onChange: (newValue: string) => void;
  accentColor?: string;
}

export function parseMonthsList(str: string): number[] {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 12)
    .sort((a, b) => a - b);
}

/**
 * Smartly derives a clean human-readable frequency label from selected months.
 * E.g.
 * - 1..12 => "每月"
 * - 3,6,9,12 => "季繳 (3,6,9,12)"
 * - 1,4,7,10 => "季繳 (1,4,7,10)"
 * - 2,5,8,11 => "季繳 (2,5,8,11)"
 * - any 4 months => "季繳 (m1,m2,m3,m4)"
 * - 6,12 or 1,7 => "半年繳 (m1,m2)"
 * - single month => "每年 (m月)"
 * - others => "指定扣款 (X 個月)"
 */
export function getSmartFrequencyLabel(monthsStr: string): string {
  const list = parseMonthsList(monthsStr);
  if (list.length === 0) return "未指定";
  if (list.length === 12) return "每月";

  const key = list.join(",");
  if (key === "3,6,9,12" || key === "1,4,7,10" || key === "2,5,8,11") {
    return `季繳 (${key})`;
  }
  if (list.length === 4) {
    return `季繳 (${key})`;
  }
  if (list.length === 2) {
    return `半年繳 (${key})`;
  }
  if (list.length === 1) {
    return `每年 (${list[0]}月)`;
  }
  return `指定 (${list.map((m) => `${m}月`).join(",")})`;
}

export function MonthSelector({ value, onChange, accentColor = "#f59e0b" }: MonthSelectorProps) {
  const selectedMonths = parseMonthsList(value);

  function toggleMonth(m: number) {
    let updated: number[];
    if (selectedMonths.includes(m)) {
      updated = selectedMonths.filter((x) => x !== m);
    } else {
      updated = [...selectedMonths, m].sort((a, b) => a - b);
    }
    onChange(updated.join(","));
  }

  function clearAll() {
    onChange("");
  }

  function selectAll() {
    onChange("1,2,3,4,5,6,7,8,9,10,11,12");
  }

  const smartLabel = getSmartFrequencyLabel(value);

  return (
    <div
      style={{
        background: "rgba(245, 158, 11, 0.06)",
        border: "1px solid rgba(245, 158, 11, 0.25)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
            <span>📅</span> 指定扣款月份（直接點選 1~12 月）
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: selectedMonths.length > 0 ? "rgba(245, 158, 11, 0.2)" : "rgba(255, 255, 255, 0.05)",
              color: selectedMonths.length > 0 ? "#fbbf24" : "var(--muted)",
              fontWeight: 600,
            }}
          >
            {selectedMonths.length > 0 ? `週期：${smartLabel}` : "尚未選擇"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={selectAll}
          >
            全選 (1~12月)
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "2px 8px", color: "var(--muted)" }}
            onClick={clearAll}
          >
            清空
          </button>
        </div>
      </div>

      {/* 1~12 Interactive Lighted Month Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
          const isSelected = selectedMonths.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggleMonth(m)}
              aria-label={`${m}月`}
              aria-pressed={isSelected}
              style={{
                padding: "8px 0",
                fontSize: 13,
                borderRadius: 6,
                background: isSelected
                  ? "linear-gradient(180deg, #fbbf24 0%, #d97706 100%)"
                  : "rgba(0, 0, 0, 0.35)",
                color: isSelected ? "#111827" : "var(--muted)",
                fontWeight: isSelected ? 800 : 500,
                border: isSelected
                  ? "1px solid #fbbf24"
                  : "1px solid rgba(255, 255, 255, 0.09)",
                boxShadow: isSelected
                  ? "0 0 10px rgba(245, 158, 11, 0.5), inset 0 1px 1px rgba(255,255,255,0.4)"
                  : "none",
                cursor: "pointer",
                transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: isSelected ? "scale(1.03)" : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <span>{m}月</span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: isSelected ? "#111827" : "transparent",
                  opacity: isSelected ? 0.75 : 0,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Informational Selection Confirmation Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: selectedMonths.length > 0 ? "var(--fg)" : "var(--muted)",
          paddingTop: 4,
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <div>
          {selectedMonths.length === 0 ? (
            <span style={{ color: "#ef4444" }}>⚠️ 請直接點擊上方月份按鈕進行勾選</span>
          ) : (
            <span>
              💡 扣款週期判定：
              <strong style={{ color: "#fbbf24", margin: "0 4px" }}>
                {smartLabel}
              </strong>
              （共 {selectedMonths.length} 個月份）
            </span>
          )}
        </div>
        {selectedMonths.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            全年預計扣款 {selectedMonths.length} 期
          </span>
        )}
      </div>
    </div>
  );
}
