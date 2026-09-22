"use client";

import { Amount } from "@/components/Amount";
import type { BudgetItem } from "./types";

interface ForecastSummaryCardsProps {
  budgetItems: BudgetItem[];
  currentMonthIdx: number;
}

export function ForecastSummaryCards({ budgetItems, currentMonthIdx }: ForecastSummaryCardsProps) {
  const totalAnnualBudgetMinor = budgetItems.reduce((s, b) => s + b.annualAmountMinor, 0n);
  const totalSpentSoFarMinor = budgetItems.reduce((s, b) => s + b.spentAmountMinor, 0n);
  const totalRemainingBudgetMinor = budgetItems.reduce((s, b) => s + b.remainingAmountMinor, 0n);
  const totalFutureMonthlyMinor = budgetItems.reduce((s, b) => s + b.dynamicFutureMonthlyMinor, 0n);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
        marginBottom: 24,
      }}
    >
      <div className="ff3-card" style={{ padding: "16px 18px", borderLeft: "4px solid #6366f1" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>年度預算總額</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace" }}>
          <Amount value={totalAnnualBudgetMinor} currency="TWD" />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          共 {budgetItems.length} 項預算項目
        </div>
      </div>

      <div className="ff3-card" style={{ padding: "16px 18px", borderLeft: "4px solid #3b82f6" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>至今實際已支 (實支)</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "#60a5fa" }}>
          <Amount value={totalSpentSoFarMinor} currency="TWD" />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          1 ~ {currentMonthIdx} 月累計已繳納
        </div>
      </div>

      <div className="ff3-card" style={{ padding: "16px 18px", borderLeft: "4px solid #10b981" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>剩餘可用額度</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "var(--income)" }}>
          <Amount value={totalRemainingBudgetMinor} currency="TWD" />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          年度預算扣除實支後之餘額
        </div>
      </div>

      <div className="ff3-card" style={{ padding: "16px 18px", borderLeft: "4px solid #f59e0b" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>浮動開銷動態均攤 (預估)</div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "#facc15" }}>
          <Amount value={totalFutureMonthlyMinor} currency="TWD" />
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
          動態滾動除以剩餘月份
        </div>
      </div>
    </div>
  );
}
