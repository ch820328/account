"use client";

import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import { trpc } from "@/lib/trpc";
import React, { useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import { getCategoryFullName, getParentCategoryName } from "@/lib/categories";
function calculateTaiwanIncomeTax(annualGrossIncome: number): number {
  const totalDeduction = 446000;
  const netTaxable = Math.max(0, annualGrossIncome - totalDeduction);

  let tax = 0;
  if (netTaxable <= 590000) {
    tax = netTaxable * 0.05;
  } else if (netTaxable <= 1330000) {
    tax = netTaxable * 0.12 - 41300;
  } else if (netTaxable <= 2660000) {
    tax = netTaxable * 0.20 - 147700;
  } else if (netTaxable <= 4980000) {
    tax = netTaxable * 0.30 - 413700;
  } else {
    tax = netTaxable * 0.40 - 911700;
  }
  return Math.round(tax);
}

export function SummaryTab() {
  const [viewMode, setViewMode] = useState<"monthly" | "category">("monthly");

  return (
    <div>
      <div className="seg" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={viewMode === "monthly" ? "active" : ""}
          onClick={() => setViewMode("monthly")}
        >
          📊 月度現金流與所得稅預測 (至隔年年底)
        </button>
        <button
          type="button"
          className={viewMode === "category" ? "active" : ""}
          onClick={() => setViewMode("category")}
        >
          📂 分類別年度固定總開銷
        </button>
      </div>

      {viewMode === "monthly" ? <MonthlyCashFlowReport /> : <CategorySummaryView />}
    </div>
  );
}

function MonthlyCashFlowReport() {
  const upcoming = trpc.transactions.upcoming.useQuery({ days: 500 });
  const netWorth = trpc.netWorth.summary.useQuery();
  const fxQuery = trpc.accounts.activeFxRates.useQuery();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const reportData = useMemo(() => {
    if (!upcoming.data) return null;

    const base = netWorth.data?.baseCurrency ?? "TWD";
    const now = new Date();
    const months: string[] = [];

    // Generate month strings from current month to December of next year (e.g. 2026-08 to 2027-12)
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let year = currentYear;
    let month = currentMonth;
    const endYear = currentYear + 1;

    while (year < endYear || (year === endYear && month <= 11)) {
      const mStr = `${year}-${String(month + 1).padStart(2, "0")}`;
      months.push(mStr);
      month++;
      if (month > 11) {
        month = 0;
        year++;
      }
    }

    // 1. Calculate current year Total Taxable Income for next May Income Tax Estimation
    let currentYearGrossIncomeMinor = 0n;
    for (const item of upcoming.data) {
      if (item.date.startsWith(String(currentYear)) && item.kind === "income") {
        currentYearGrossIncomeMinor += item.amountMinor;
      }
    }
    const estimatedNextMayTaxTwd = calculateTaiwanIncomeTax(Number(currentYearGrossIncomeMinor) / 100);
    const estimatedNextMayTaxMinor = BigInt(estimatedNextMayTaxTwd * 100);

    // 2. Build monthly items
    const monthlyList = months.map((mStr) => {
      const items = upcoming.data?.filter((u) => u.date.startsWith(mStr)) ?? [];

      let incomeTotal = 0n;
      let expenseTotal = 0n;

      const itemsProcessed = items.map((item) => {
        let val = item.amountMinor;
        if (item.currency !== base) {
          const rate = fxQuery.data?.rates.find((r) => r.currency === item.currency)?.rate;
          if (rate) {
            val = BigInt(Math.round(Number(item.amountMinor) * rate));
          }
        }
        if (item.kind === "income") incomeTotal += val;
        else if (item.kind === "expense") expenseTotal += val;

        return { ...item, convertedMinor: val };
      });

      // Insert dynamic next May Income Tax
      if (mStr === `${currentYear + 1}-05` && estimatedNextMayTaxMinor > 0n) {
        expenseTotal += estimatedNextMayTaxMinor;
        itemsProcessed.push({
          date: `${mStr}-25`,
          name: `綜合所得稅 (根據 ${currentYear} 年度總收入估算)`,
          kind: "expense",
          amountMinor: estimatedNextMayTaxMinor,
          currency: base,
          convertedMinor: estimatedNextMayTaxMinor,
          ruleId: "tax_est",
          paid: false,
        } as any);
      }

      const netCashflow = incomeTotal - expenseTotal;

      return {
        monthStr: mStr,
        items: itemsProcessed,
        incomeTotal,
        expenseTotal,
        netCashflow,
      };
    });

    return { monthlyList, base, estimatedNextMayTaxTwd, currentYear };
  }, [upcoming.data, netWorth.data, fxQuery.data]);

  if (!reportData) return <SkeletonList rows={6} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: "16px 20px", borderLeft: "4px solid var(--primary)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: "bold" }}>📅 月度現金流與動態所得稅預測 (現至隔年年底)</h3>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          自動列出當月份至隔年 12 月的預估總收入、固定支出與淨現金流。<br />
          💡 <strong>明年 5 月綜合所得稅預估</strong>：系統已根據 {reportData.currentYear} 全年度實際薪資與 RSU 總收入，自動帶入台灣累進稅率公式計算預估應繳稅額：<strong style={{ color: "var(--expense)" }}>${reportData.estimatedNextMayTaxTwd.toLocaleString()} 元</strong>！
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
              <th style={{ padding: "12px 16px", textAlign: "left" }}>月份</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>預估總收入</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>預估總支出</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>當月淨現金流</th>
              <th style={{ padding: "12px 16px", textAlign: "center", width: "100px" }}>明細展開</th>
            </tr>
          </thead>
          <tbody>
            {reportData.monthlyList.map((m) => {
              const isExpanded = expandedMonth === m.monthStr;
              return (
                <React.Fragment key={m.monthStr}>
                  <tr
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "14px 16px", fontWeight: "bold", fontSize: 14 }}>
                      📅 {m.monthStr}
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: "var(--income)", fontWeight: 500 }}>
                      +<Amount value={m.incomeTotal} currency={reportData.base} kind="income" />
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", color: "var(--expense)", fontWeight: 500 }}>
                      -<Amount value={m.expenseTotal} currency={reportData.base} kind="expense" />
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right", fontWeight: "bold" }}>
                      <span style={{ color: m.netCashflow >= 0n ? "var(--income)" : "var(--expense)" }}>
                        {m.netCashflow >= 0n ? "+" : ""}<Amount value={m.netCashflow} currency={reportData.base} kind={m.netCashflow >= 0n ? "income" : "expense"} />
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ fontSize: 12 }}
                        onClick={() => setExpandedMonth(isExpanded ? null : m.monthStr)}
                      >
                        {isExpanded ? "收合 ▲" : "查看明細 ▼"}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: 16, background: "rgba(0,0,0,0.2)" }}>
                        <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderRadius: 8 }}>
                          <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)" }}>
                            📌 {m.monthStr} 完整預估收支細項清單 ({m.items.length} 筆)
                          </h4>
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                                <th style={{ padding: "6px 8px", textAlign: "left" }}>日期</th>
                                <th style={{ padding: "6px 8px", textAlign: "left" }}>項目</th>
                                <th style={{ padding: "6px 8px", textAlign: "center" }}>類型</th>
                                <th style={{ padding: "6px 8px", textAlign: "right" }}>預估金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                                  <td style={{ padding: "6px 8px", color: "var(--muted)" }}>{item.date}</td>
                                  <td style={{ padding: "6px 8px", fontWeight: 500 }}>{item.name}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: 10,
                                        background:
                                          item.kind === "income"
                                            ? "rgba(81,207,102,0.15)"
                                            : item.kind === "rsu"
                                              ? "rgba(168,85,247,0.15)"
                                              : item.kind === "transfer"
                                                ? "rgba(59,130,246,0.15)"
                                                : "rgba(255,107,107,0.15)",
                                        color:
                                          item.kind === "income"
                                            ? "var(--income)"
                                            : item.kind === "rsu"
                                              ? "#a855f7"
                                              : item.kind === "transfer"
                                                ? "#3b82f6"
                                                : "var(--expense)",
                                      }}
                                    >
                                      {item.kind === "income"
                                        ? "收入"
                                        : item.kind === "rsu"
                                          ? "股票歸屬"
                                          : item.kind === "transfer"
                                            ? "轉帳"
                                            : "支出"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "bold" }}>
                                    {item.kind === "rsu" ? (
                                      <span style={{ color: "#a855f7", fontSize: 12 }}>
                                        {item.note || ""}{item.amountMinor > 0n ? ` (約 $${(Number(item.amountMinor)/100).toLocaleString()})` : ""}
                                      </span>
                                    ) : (
                                      <Amount value={item.amountMinor} currency={item.currency} kind={item.kind === "income" ? "income" : "expense"} />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategorySummaryView() {
  const rules = trpc.recurring.list.useQuery();
  const loans = trpc.loanPayments.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const summary = useMemo(() => {
    if (!rules.data || !loans.data || !categories.data) return null;
    
    // Group by category name
    const groups = new Map<string, { items: any[]; totalYearlyMinor: bigint }>();

    const getGroup = (name: string) => {
      if (!groups.has(name)) groups.set(name, { items: [], totalYearlyMinor: 0n });
      return groups.get(name)!;
    };

    // 1. Process recurring rules (expenses and transfers)
    for (const r of rules.data) {
      if (!r.active) continue;
      
      const parentCatName = r.kind === "transfer" ? "轉帳" : getParentCategoryName(r.categoryId, categories.data);
      const group = getGroup(parentCatName);
      
      let multiplier = 12n;
      let monthStr = "每月";

      if (r.frequency === "yearly") {
        multiplier = 1n;
        if (r.anchorDate) {
          const m = new Date(r.anchorDate).getMonth() + 1;
          monthStr = `${m}月`;
        } else {
          monthStr = "每年";
        }
      } else if (r.frequency === "monthly") {
        const interval = r.interval || 1;
        multiplier = BigInt(Math.max(1, Math.floor(12 / interval)));
        if (interval === 6) monthStr = "每半年";
        else if (interval === 3) monthStr = "每季";
        else if (interval === 2) monthStr = "雙月";
        else monthStr = "每月";
      }

      const yearlyCost = r.amountMinor * multiplier;
      
      group.items.push({
        name: r.name,
        monthStr,
        amountMinor: r.amountMinor,
        currency: r.currency,
        yearlyCost,
        isExpense: r.kind === "expense",
      });
      
      if (r.kind === "expense") {
        group.totalYearlyMinor += yearlyCost;
      }
    }

    // 2. Process loans
    for (const l of loans.data) {
      if (!l.active) continue;
      const group = getGroup("房屋 / 貸款");
      const yearlyCost = l.amountMinor * 12n;
      
      group.items.push({
        name: l.name,
        monthStr: "每月",
        amountMinor: l.amountMinor,
        currency: l.currency,
        yearlyCost,
        isExpense: true,
      });
      
      group.totalYearlyMinor += yearlyCost;
    }

    let totalYearlyExpense = 0n;
    for (const g of groups.values()) {
      totalYearlyExpense += g.totalYearlyMinor;
    }

    return { groups: Array.from(groups.entries()), totalYearlyExpense };
  }, [rules.data, loans.data, categories.data]);

  if (!summary) return <SkeletonList rows={5} />;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="primary" style={{ fontSize: 18, fontWeight: "bold" }}>預估年度固定總開銷</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              匯集定期排程、貸款與分期之年度固定支出總金額
            </div>
          </div>
          <Amount value={summary.totalYearlyExpense} currency="TWD" kind="expense" variant="stat" />
        </div>
      </div>

      <div className="grid cols-2" style={{ gap: "20px" }}>
        {summary.groups
          .filter(([_, g]) => g.items.length > 0)
          .map(([catName, group]) => (
            <div 
              key={catName} 
              className="card" 
              style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <div 
                style={{ 
                  padding: "12px 16px", 
                  background: "var(--surface-2)", 
                  borderBottom: "1px solid var(--border)", 
                  display: "flex", 
                  justifyContent: "space-between",
                  alignItems: "center" 
                }}
              >
                <span style={{ fontWeight: "bold", fontSize: "15px", color: "var(--fg)" }}>{catName}</span>
                <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--expense)" }}>
                  年計: <Amount value={group.totalYearlyMinor} currency="TWD" kind={group.totalYearlyMinor > 0n ? "expense" : "neutral"} />
                </span>
              </div>
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>名稱</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, width: "80px" }}>月份/週期</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>單價 (每期)</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>年花費</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, idx) => (
                      <tr 
                        key={idx} 
                        style={{ 
                          borderBottom: idx < group.items.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" 
                        }}
                      >
                        <td style={{ padding: "10px 12px", fontWeight: 500 }}>{item.name}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span className="badge muted-badge" style={{ fontSize: "11px", padding: "2px 6px" }}>
                            {item.monthStr}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          {fmt(item.amountMinor, item.currency)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "bold" }}>
                          <Amount value={item.yearlyCost} currency={item.currency} kind={item.isExpense ? "expense" : "neutral"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

