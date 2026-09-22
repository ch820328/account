"use client";

import React, { useState } from "react";
import { Amount } from "@/components/Amount";
import { DashboardStatDetailModal, StatModalType } from "./DashboardStatDetailModal";

export type DashboardStatsProps = {
  // Expenses
  actualExpenseMinor: bigint; // 已經發生的開銷 (實付)
  expectedExpenseMinor: bigint; // 預期發生的開銷 (待付/待扣)
  totalProjectedExpenseMinor: bigint; // 總預計支出 (已發生 + 預期)

  // Incomes
  actualIncomeMinor: bigint; // 已經入帳的收入 (實收)
  expectedIncomeMinor: bigint; // 預期發生的收入 (待入帳)
  totalProjectedIncomeMinor: bigint; // 總預計收入 (已入帳 + 預期)

  // Net Cashflow & Net Worth
  actualNetChange: bigint; // 目前已實現淨額 (實收 - 實付)
  projectedNetChange: bigint; // 全月預計結餘 (預估總收 - 預估總支)
  netWorthTotal: bigint; // 總淨資產

  // Credit Card Total
  creditExpenseTotal?: bigint;

  baseCurrency?: string;
  selectedMonth?: string;
};

export function DashboardStats({
  actualExpenseMinor,
  expectedExpenseMinor,
  totalProjectedExpenseMinor,
  actualIncomeMinor,
  expectedIncomeMinor,
  totalProjectedIncomeMinor,
  actualNetChange,
  projectedNetChange,
  netWorthTotal,
  creditExpenseTotal,
  baseCurrency = "TWD",
  selectedMonth,
}: DashboardStatsProps) {
  const [activeModal, setActiveModal] = useState<StatModalType | null>(null);

  // Expense progress (已發生開銷佔預估總開銷比例)
  const expenseProgressPct =
    totalProjectedExpenseMinor > 0n
      ? Math.min(100, Math.max(0, Math.round((Number(actualExpenseMinor) / Number(totalProjectedExpenseMinor)) * 100)))
      : actualExpenseMinor > 0n
      ? 100
      : 0;

  // Income progress (已入帳收入佔預估總收入比例)
  const incomeProgressPct =
    totalProjectedIncomeMinor > 0n
      ? Math.min(100, Math.max(0, Math.round((Number(actualIncomeMinor) / Number(totalProjectedIncomeMinor)) * 100)))
      : actualIncomeMinor > 0n
      ? 100
      : 0;

  // Monthly defense ratio (總預期開銷佔總預期收入百分比)
  const expenseRatio =
    totalProjectedIncomeMinor > 0n
      ? Math.min(100, Math.max(0, Math.round((Number(totalProjectedExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100)))
      : 0;

  const savingsRatio = 100 - expenseRatio;
  const isOverBudget = totalProjectedExpenseMinor > totalProjectedIncomeMinor && totalProjectedIncomeMinor > 0n;

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* CARD 1: 本月開銷 (已發生 vs 預期發生) */}
        <div
          className="ff3-card ff3-stat-card"
          style={{
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("actual_expense")}
              title="點擊查看已發生開銷與明細"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                <span>🔴</span> 本月總支出預估
                <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#fca5a5",
                  fontWeight: 600,
                }}
              >
                已支出 {expenseProgressPct}%
              </span>
            </div>

            {/* Main Expense Total */}
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#ef4444",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "-0.5px",
                marginBottom: 12,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("actual_expense")}
              title="點擊查看已發生開銷總覽"
            >
              <Amount value={totalProjectedExpenseMinor} currency={baseCurrency} />
            </div>

            {/* Sub-breakdown: 已發生開銷 vs 預期發生開銷 */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("actual_expense");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看本月已發生開銷（含信用卡帳單與水電）"
              >
                <span style={{ color: "var(--fg)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "#ef4444" }}>●</span> 已經發生的開銷:
                  <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
                </span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--fg)" }}>
                  <Amount value={actualExpenseMinor} currency={baseCurrency} />
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("expected_expense");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245, 158, 11, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看預期開銷與預算保留額度明細"
              >
                <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "#f59e0b" }}>○</span> 預期發生的開銷:
                  <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
                </span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: "#fbbf24" }}>
                  <Amount value={expectedExpenseMinor} currency={baseCurrency} />
                </span>
              </div>
            </div>
          </div>

          {/* Mini progress bar showing spent vs upcoming */}
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                height: 5,
                width: "100%",
                background: "rgba(255, 255, 255, 0.08)",
                borderRadius: 3,
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${expenseProgressPct}%`,
                  background: "#ef4444",
                  transition: "width 0.3s ease",
                }}
              />
              <div
                style={{
                  height: "100%",
                  width: `${100 - expenseProgressPct}%`,
                  background: "rgba(245, 158, 11, 0.45)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              <span>實付已扣 {expenseProgressPct}%</span>
              <span>待付扣款 {100 - expenseProgressPct}%</span>
            </div>
          </div>
        </div>

        {/* CARD 2: 本月收入 (已入帳 vs 預期待入帳) */}
        <div
          className="ff3-card ff3-stat-card"
          style={{
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("income")}
              title="點擊查看薪資單結構與收入明細"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#34d399" }}>
                <span>🟢</span> 本月總收入預估
                <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: incomeProgressPct === 100 ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.15)",
                  color: incomeProgressPct === 100 ? "#6ee7b7" : "#fbbf24",
                  fontWeight: 600,
                }}
              >
                {incomeProgressPct === 100 ? "全數到帳" : `到帳 ${incomeProgressPct}%`}
              </span>
            </div>

            {/* Main Income Total */}
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#10b981",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "-0.5px",
                marginBottom: 12,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("income")}
              title="點擊查看薪資單實領金額明細"
            >
              <Amount value={totalProjectedIncomeMinor} currency={baseCurrency} />
            </div>

            {/* Sub-breakdown: 已入帳收入 vs 預期發生收入 */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("income");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(16, 185, 129, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看已入帳收入"
              >
                <span style={{ color: "var(--fg)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "#10b981" }}>●</span> 已經入帳的收入:
                </span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: "#10b981" }}>
                  <Amount value={actualIncomeMinor} currency={baseCurrency} />
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("income");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(96, 165, 250, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看 9/25 待入帳薪資單扣除明細"
              >
                <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: "#60a5fa" }}>○</span> 預期發生的收入:
                  <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
                </span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: expectedIncomeMinor > 0n ? "#60a5fa" : "var(--muted)" }}>
                  <Amount value={expectedIncomeMinor} currency={baseCurrency} />
                </span>
              </div>
            </div>
          </div>

          {/* Mini progress bar showing received vs upcoming */}
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                height: 5,
                width: "100%",
                background: "rgba(255, 255, 255, 0.08)",
                borderRadius: 3,
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${incomeProgressPct}%`,
                  background: "#10b981",
                  transition: "width 0.3s ease",
                }}
              />
              <div
                style={{
                  height: "100%",
                  width: `${100 - incomeProgressPct}%`,
                  background: "rgba(96, 165, 250, 0.45)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              <span>已入帳 {incomeProgressPct}%</span>
              <span>{expectedIncomeMinor > 0n ? `待入帳 ${100 - incomeProgressPct}%` : "全數入帳"}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: 本月預估結餘與淨資產 */}
        <div
          className="ff3-card ff3-stat-card"
          style={{
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("projected_balance")}
              title="點擊查看收支結餘試算方程式"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>
                <span>🔵</span> 本月預估結餘
                <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: projectedNetChange >= 0n ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: projectedNetChange >= 0n ? "#34d399" : "#f87171",
                  fontWeight: 600,
                }}
              >
                {projectedNetChange >= 0n ? "預期盈餘" : "預期赤字"}
              </span>
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: projectedNetChange >= 0n ? "#10b981" : "#ef4444",
                fontFamily: "var(--font-mono, monospace)",
                letterSpacing: "-0.5px",
                marginBottom: 12,
                cursor: "pointer",
              }}
              onClick={() => setActiveModal("projected_balance")}
              title="點擊查看收支結餘試算"
            >
              <Amount value={projectedNetChange} currency={baseCurrency} signed={true} />
            </div>

            {/* Sub-breakdown: 目前實質淨額 vs 總淨資產 */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.25)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
                border: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("projected_balance");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59, 130, 246, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看收支現金流結餘"
              >
                <span style={{ color: "var(--muted)" }}>目前實現淨額 (收 - 支):</span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: actualNetChange >= 0n ? "#34d399" : "#f87171" }}>
                  <Amount value={actualNetChange} currency={baseCurrency} signed={true} />
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  padding: "3px 6px",
                  borderRadius: 6,
                  transition: "background 0.15s ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal("net_worth");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="點擊查看個人總淨資產結構明細"
              >
                <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span>💎 總淨資產 (Net Worth):</span>
                  <span style={{ fontSize: 10, opacity: 0.6 }}>🔍</span>
                </span>
                <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--fg)" }}>
                  <Amount value={netWorthTotal} currency={baseCurrency} />
                </span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12 }}>
            全月預期儲蓄率：
            <strong style={{ color: projectedNetChange >= 0n ? "var(--income)" : "var(--expense)", marginLeft: 4 }}>
              {savingsRatio}%
            </strong>
          </div>
        </div>
      </div>

      {/* Monthly Financial Defense & Savings Ratio Banner */}
      {totalProjectedIncomeMinor > 0n && (
        <div
          className="ff3-card"
          style={{
            marginTop: 14,
            padding: "12px 18px",
            background: "rgba(25, 34, 45, 0.6)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
            <span style={{ color: "var(--muted)" }}>
              📊 {selectedMonth || "本月"} 收支全景防禦率：
              <strong style={{ color: isOverBudget ? "var(--expense)" : "var(--fg)", marginLeft: 6 }}>
                總預期開銷佔總預期收入 {expenseRatio}%
              </strong>
            </span>
            <span style={{ color: isOverBudget ? "var(--expense)" : "var(--income)", fontWeight: 600 }}>
              {isOverBudget ? `⚠️ 本月預期透支赤字` : `💪 本月預期儲蓄率 ${savingsRatio}%`}
            </span>
          </div>

          <div
            style={{
              height: 8,
              width: "100%",
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, Math.round((Number(actualExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100))}%`,
                background: "#ef4444",
                transition: "width 0.4s ease",
              }}
              title="已發生開銷佔比"
            />
            <div
              style={{
                height: "100%",
                width: `${Math.min(100 - Math.min(100, Math.round((Number(actualExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100)), Math.round((Number(expectedExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100))}%`,
                background: "rgba(245, 158, 11, 0.7)",
                transition: "width 0.4s ease",
              }}
              title="預期發生開銷佔比"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#ef4444" }}>■</span> 已支出 {Math.round((Number(actualExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100)}%
              <span style={{ color: "#f59e0b", marginLeft: 8 }}>■</span> 預期待支出 {Math.round((Number(expectedExpenseMinor) / Number(totalProjectedIncomeMinor)) * 100)}%
            </span>
            <span>預期保留結餘 {savingsRatio}%</span>
          </div>
        </div>
      )}

      {/* Interactive Detail Modal for All 6 Stat Indicators */}
      <DashboardStatDetailModal
        isOpen={activeModal !== null}
        onClose={() => setActiveModal(null)}
        initialType={activeModal ?? "actual_expense"}
        selectedMonth={selectedMonth}
        baseCurrency={baseCurrency}
        actualExpenseMinor={actualExpenseMinor}
        expectedExpenseMinor={expectedExpenseMinor}
        totalProjectedExpenseMinor={totalProjectedExpenseMinor}
        actualIncomeMinor={actualIncomeMinor}
        expectedIncomeMinor={expectedIncomeMinor}
        totalProjectedIncomeMinor={totalProjectedIncomeMinor}
        actualNetChange={actualNetChange}
        projectedNetChange={projectedNetChange}
        netWorthTotal={netWorthTotal}
        creditExpenseTotal={creditExpenseTotal}
      />
    </div>
  );
}
