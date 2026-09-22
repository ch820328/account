import React from "react";

interface MatrixFooterTotalsProps {
  currentMonthIdx: number;
  yearFixedSum: number;
  yearFixedSpentSum: number;
  yearFixedBudgetToDateSum: number;
  monthlyFixedTotals: Record<number, number>;
  yearRollingSum: number;
  yearRollingSpentSum: number;
  yearRollingBudgetToDateSum: number;
  monthlyRollingTotals: Record<number, number>;
  yearGrandSum: number;
  yearGrandSpentSum: number;
  yearGrandBudgetToDateSum: number;
  monthlyGrandTotals: Record<number, number>;
  hasEditAction?: boolean;
}

export function MatrixFooterTotals({
  currentMonthIdx,
  yearFixedSum,
  yearFixedSpentSum,
  yearFixedBudgetToDateSum,
  monthlyFixedTotals,
  yearRollingSum,
  yearRollingSpentSum,
  yearRollingBudgetToDateSum,
  monthlyRollingTotals,
  yearGrandSum,
  yearGrandSpentSum,
  yearGrandBudgetToDateSum,
  monthlyGrandTotals,
  hasEditAction = false,
}: MatrixFooterTotalsProps) {
  const fixedDiff = yearFixedSpentSum - yearFixedBudgetToDateSum;
  const rollingDiff = yearRollingSpentSum - yearRollingBudgetToDateSum;
  const grandDiff = yearGrandSpentSum - yearGrandBudgetToDateSum;

  return (
    <tfoot style={{ background: "rgba(0, 0, 0, 0.4)", borderTop: "2px solid rgba(255, 255, 255, 0.15)" }}>
      {/* Row 1: Fixed Expense Subtotal */}
      <tr style={{ borderTop: "2px solid rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.05)" }}>
        <td colSpan={2} style={{ padding: "10px 10px", textAlign: "left", fontWeight: 700, color: "#fbbf24" }}>
          📌 固定開銷小計
        </td>
        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#fbbf24" }}>
          ${yearFixedSum.toLocaleString()}
        </td>
        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
          <div style={{ color: yearFixedSpentSum > 0 ? "#60a5fa" : "var(--muted)" }}>
            ${yearFixedSpentSum.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: fixedDiff < 0 ? "#34d399" : fixedDiff > 0 ? "#f87171" : "var(--muted)" }}>
            {fixedDiff < 0 ? `+${Math.abs(fixedDiff).toLocaleString()} 結餘` : fixedDiff > 0 ? `-${fixedDiff.toLocaleString()} 超支` : "±0 持平"}
          </div>
        </td>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
          <td
            key={m}
            style={{
              padding: "8px 2px",
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#fbbf24",
              background: m === currentMonthIdx ? "rgba(245, 158, 11, 0.1)" : undefined,
            }}
          >
            ${Math.round(monthlyFixedTotals[m] ?? 0).toLocaleString()}
          </td>
        ))}
        {hasEditAction && <td />}
      </tr>

      {/* Row 2: Rolling Living Budget Subtotal */}
      <tr style={{ borderTop: "1px solid rgba(99, 102, 241, 0.2)", background: "rgba(99, 102, 241, 0.05)" }}>
        <td colSpan={2} style={{ padding: "10px 10px", textAlign: "left", fontWeight: 700, color: "#a5b4fc" }}>
          🔄 浮動生活預算小計
        </td>
        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#a5b4fc" }}>
          ${yearRollingSum.toLocaleString()}
        </td>
        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
          <div style={{ color: yearRollingSpentSum > 0 ? "#60a5fa" : "var(--muted)" }}>
            ${yearRollingSpentSum.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: rollingDiff < 0 ? "#34d399" : rollingDiff > 0 ? "#f87171" : "var(--muted)" }}>
            {rollingDiff < 0 ? `+${Math.abs(rollingDiff).toLocaleString()} 結餘` : rollingDiff > 0 ? `-${rollingDiff.toLocaleString()} 超支` : "±0 持平"}
          </div>
        </td>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
          <td
            key={m}
            style={{
              padding: "8px 2px",
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#a5b4fc",
              background: m === currentMonthIdx ? "rgba(99, 102, 241, 0.1)" : undefined,
            }}
          >
            ${Math.round(monthlyRollingTotals[m] ?? 0).toLocaleString()}
          </td>
        ))}
        {hasEditAction && <td />}
      </tr>

      {/* Row 3: Grand Total Budget Per Month */}
      <tr
        style={{
          borderTop: "2px solid rgba(255, 255, 255, 0.2)",
          borderBottom: "2px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(255, 255, 255, 0.06)",
        }}
      >
        <td colSpan={2} style={{ padding: "12px 10px", textAlign: "left", fontWeight: 800, fontSize: 13, color: "var(--fg)" }}>
          💰 當月預算總支出合計
        </td>
        <td style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 13, color: "var(--fg)" }}>
          ${yearGrandSum.toLocaleString()}
        </td>
        <td style={{ padding: "12px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 800, fontSize: 13 }}>
          <div style={{ color: yearGrandSpentSum > 0 ? "#38bdf8" : "var(--muted)" }}>
            ${yearGrandSpentSum.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: grandDiff < 0 ? "#34d399" : grandDiff > 0 ? "#f87171" : "var(--muted)" }}>
            {grandDiff < 0 ? `+${Math.abs(grandDiff).toLocaleString()} 結餘` : grandDiff > 0 ? `-${grandDiff.toLocaleString()} 超支` : "±0 持平"}
          </div>
        </td>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
          <td
            key={m}
            style={{
              padding: "10px 2px",
              fontFamily: "monospace",
              fontWeight: 800,
              fontSize: 12,
              color: m === currentMonthIdx ? "#38bdf8" : "var(--fg)",
              background: m === currentMonthIdx ? "rgba(56, 189, 248, 0.18)" : undefined,
            }}
          >
            ${Math.round(monthlyGrandTotals[m] ?? 0).toLocaleString()}
          </td>
        ))}
        {hasEditAction && <td />}
      </tr>
    </tfoot>
  );
}
