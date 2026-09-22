import React from "react";

interface MatrixHeaderProps {
  targetYear: number;
  currentMonthIdx: number;
  fixedCount: number;
  rollingCount: number;
  onStartAdd?: () => void;
}

export function MatrixHeader({
  targetYear,
  currentMonthIdx,
  fixedCount,
  rollingCount,
  onStartAdd,
}: MatrixHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 16,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--fg)" }}>
            📅 一年 12 個月固定開銷與預算全景總表 ({targetYear} 年度)
          </h3>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              fontWeight: 600,
            }}
          >
            固定開銷 {fixedCount} 項 · 浮動生活預算 {rollingCount} 項
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
          依據設定之扣款週期（如 2,5,8,11 季繳、年繳或每月均攤），在 12 個月份精確對齊預算支出，隨時掌握各月份資金水位。
        </p>
      </div>

      {onStartAdd && (
        <button
          type="button"
          className="btn"
          onClick={onStartAdd}
          style={{ fontSize: 12, padding: "6px 14px" }}
        >
          ＋ 新增開銷項目
        </button>
      )}
    </div>
  );
}

export function MatrixTableHead({ currentMonthIdx }: { currentMonthIdx: number }) {
  return (
    <thead>
      <tr
        style={{
          borderBottom: "1px solid var(--border)",
          color: "var(--muted)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <th style={{ padding: "10px 10px", textAlign: "left", minWidth: 160 }}>項目 / 分類與付款方式</th>
        <th style={{ padding: "10px 6px", minWidth: 80 }}>扣款頻率</th>
        <th style={{ padding: "10px 8px", textAlign: "right", minWidth: 90 }}>
          <div>全年總額</div>
          <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>每期額度</div>
        </th>
        <th style={{ padding: "10px 8px", textAlign: "right", minWidth: 110 }}>
          <div>累計實支</div>
          <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>累加累減 (結餘/超支)</div>
        </th>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
          <th
            key={m}
            style={{
              padding: "8px 2px",
              minWidth: 46,
              background: m === currentMonthIdx ? "rgba(99, 102, 241, 0.18)" : "transparent",
              color: m === currentMonthIdx ? "#a5b4fc" : undefined,
              fontWeight: m === currentMonthIdx ? 700 : 500,
              borderLeft: "1px solid rgba(255,255,255,0.03)",
              borderRight: "1px solid rgba(255,255,255,0.03)",
            }}
          >
            <div>{m}月</div>
            {m === currentMonthIdx && (
              <span style={{ fontSize: 9, color: "#818cf8", fontWeight: 700 }}>★本月</span>
            )}
          </th>
        ))}
        <th style={{ padding: "10px 6px", minWidth: 80, textAlign: "center" }}>順序 / 操作</th>
      </tr>
    </thead>
  );
}
