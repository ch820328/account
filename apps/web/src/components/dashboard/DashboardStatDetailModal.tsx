"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { fmt } from "@/lib/format";
import { Amount } from "@/components/Amount";
import { CategoryOptions } from "@/components/CategoryOptions";
import { CategoryPickerModal } from "@/components/CategoryPickerModal";

export interface UpcomingBillItem {
  date: string;
  name: string;
  kind: "income" | "expense" | "transfer" | "rsu";
  amountMinor: bigint | string | number;
  currency: string;
  note?: string;
}

export interface PendingBudgetItem {
  name: string;
  estimatedAmount: number;
}

export interface TransactionListItem {
  id: string;
  note?: string | null;
  occurredAt: Date | string;
  amountMinor: bigint | string | number;
  currency: string;
  categoryId?: string | null;
  categoryName?: string | null;
  parentCategoryName?: string | null;
  accountName?: string | null;
  statementMonth?: string | null;
}

export interface CategoryOptionItem {
  id: string;
  name: string;
  kind?: string;
}

export type StatModalType =
  | "actual_expense" // 已經發生的開銷
  | "expected_expense" // 預期發生的開銷
  | "income" // 本月總收入預估
  | "credit" // 信用卡開銷 (含排程)
  | "projected_balance" // 本月預估結餘
  | "net_worth"; // 總淨資產

export interface DashboardStatDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: StatModalType;
  selectedMonth?: string;
  baseCurrency?: string;
  actualExpenseMinor: bigint;
  expectedExpenseMinor: bigint;
  totalProjectedExpenseMinor: bigint;
  actualIncomeMinor: bigint;
  expectedIncomeMinor: bigint;
  totalProjectedIncomeMinor: bigint;
  actualNetChange: bigint;
  projectedNetChange: bigint;
  netWorthTotal: bigint;
  creditExpenseTotal?: bigint;
  onChanged?: () => void;
}

export function DashboardStatDetailModal({
  isOpen,
  onClose,
  initialType = "actual_expense",
  selectedMonth = "2026-09",
  baseCurrency = "TWD",
  actualExpenseMinor,
  expectedExpenseMinor,
  totalProjectedExpenseMinor,
  actualIncomeMinor,
  expectedIncomeMinor,
  totalProjectedIncomeMinor,
  actualNetChange,
  projectedNetChange,
  netWorthTotal,
  creditExpenseTotal = 0n,
  onChanged,
}: DashboardStatDetailModalProps) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<StatModalType>(initialType);
  const [expenseFilter, setExpenseFilter] = useState<"all" | "credit" | "bank">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [pickerTarget, setPickerTarget] = useState<{
    id: string;
    categoryId: string | null;
    note: string;
  } | null>(null);

  // Sync tab with initialType when reopened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialType);
      setSearchTerm("");
    }
  }, [isOpen, initialType]);

  // Handle ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Query categories
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: isOpen });
  const allCategories = categoriesQuery.data ?? [];

  // Query all expenses for current month
  const expensesQuery = trpc.transactions.list.useQuery(
    {
      month: selectedMonth,
      type: "expense",
      limit: 500,
    },
    { enabled: isOpen && (activeTab === "actual_expense" || activeTab === "credit") }
  );

  // Query payroll profiles
  const payrollQuery = trpc.payroll.list.useQuery(undefined, {
    enabled: isOpen && activeTab === "income",
  });

  // Query Net Worth summary
  const netWorthQuery = trpc.netWorth.summary.useQuery(undefined, {
    enabled: isOpen && (activeTab === "net_worth" || activeTab === "projected_balance"),
  });

  // Query upcoming scheduled bills
  const upcomingBillsQuery = trpc.transactions.upcoming.useQuery(undefined, {
    enabled: isOpen && activeTab === "expected_expense",
  });

  // Query pending monthly budget items
  const currentMonthNum = Number((selectedMonth || "2026-09").split("-")[1] || 9);
  const pendingBudgetsQuery = trpc.annualBudgets.pendingMonthlyItems.useQuery(
    { month: currentMonthNum },
    { enabled: isOpen && activeTab === "expected_expense" }
  );

  // Mutation for updating transaction category
  const updateMutation = trpc.transactions.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        expensesQuery.refetch(),
        utils.transactions.monthCategories.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.transactions.list.invalidate(),
      ]);
      if (onChanged) onChanged();
    },
  });

  // Filtered expense items
  const expenseItems = useMemo(() => {
    const list = expensesQuery.data?.items ?? [];
    return list.filter((t) => {
      if (activeTab === "credit" || expenseFilter === "credit") {
        if (t.accountType !== "credit") return false;
      }
      if (expenseFilter === "bank") {
        if (t.accountType !== "bank" && t.accountType !== "cash") return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const noteMatch = (t.note || "").toLowerCase().includes(query);
        const catMatch = (t.categoryName || "").toLowerCase().includes(query);
        const accMatch = (t.accountName || "").toLowerCase().includes(query);
        return noteMatch || catMatch || accMatch;
      }
      return true;
    });
  }, [expensesQuery.data?.items, activeTab, expenseFilter, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#121826",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 14,
          width: "100%",
          maxWidth: 920,
          height: "88vh",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%)",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)", display: "flex", alignItems: "center", gap: 10 }}>
              <span>📊</span>
              <span>{selectedMonth} 財務指標全面對帳詳情</span>
            </h2>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              點擊不同指標標籤切換查看已發生開銷、薪資收入單、信用卡帳單與淨資產組成
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 8,
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--muted)",
              fontSize: 16,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--fg)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            }}
          >
            ✕
          </button>
        </div>

        {/* Indicator Tabs */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            padding: "12px 16px",
            gap: 8,
            minHeight: 60,
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.25)",
            scrollbarWidth: "none",
          }}
        >
          <button
            onClick={() => setActiveTab("actual_expense")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "actual_expense" ? "rgba(239, 68, 68, 0.5)" : "transparent",
              background: activeTab === "actual_expense" ? "rgba(239, 68, 68, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "actual_expense" ? "#fca5a5" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>🔴 已發生開銷</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(actualExpenseMinor, baseCurrency)})</span>
          </button>

          <button
            onClick={() => setActiveTab("expected_expense")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "expected_expense" ? "rgba(245, 158, 11, 0.5)" : "transparent",
              background: activeTab === "expected_expense" ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "expected_expense" ? "#fde68a" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>🟡 預期開銷與預算</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(expectedExpenseMinor, baseCurrency)})</span>
          </button>

          <button
            onClick={() => setActiveTab("income")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "income" ? "rgba(16, 185, 129, 0.5)" : "transparent",
              background: activeTab === "income" ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "income" ? "#6ee7b7" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>🟢 預估總收入 (薪資單)</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(totalProjectedIncomeMinor, baseCurrency)})</span>
          </button>

          <button
            onClick={() => setActiveTab("credit")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "credit" ? "rgba(99, 102, 241, 0.5)" : "transparent",
              background: activeTab === "credit" ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "credit" ? "#c7d2fe" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>💳 信用卡全卡帳單</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(creditExpenseTotal, baseCurrency)})</span>
          </button>

          <button
            onClick={() => setActiveTab("projected_balance")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "projected_balance" ? "rgba(59, 130, 246, 0.5)" : "transparent",
              background: activeTab === "projected_balance" ? "rgba(59, 130, 246, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "projected_balance" ? "#93c5fd" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>🔵 預估結餘試算</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(projectedNetChange, baseCurrency)})</span>
          </button>

          <button
            onClick={() => setActiveTab("net_worth")}
            style={{
              flexShrink: 0,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid",
              borderColor: activeTab === "net_worth" ? "rgba(168, 85, 247, 0.5)" : "transparent",
              background: activeTab === "net_worth" ? "rgba(168, 85, 247, 0.15)" : "rgba(255, 255, 255, 0.03)",
              color: activeTab === "net_worth" ? "#e9d5ff" : "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>💎 總淨資產結構</span>
            <span style={{ fontSize: 11, opacity: 0.8 }}>({fmt(netWorthTotal, baseCurrency)})</span>
          </button>
        </div>

        {/* Modal Scrollable Content Area */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px" }}>
          {/* TAB 1: ACTUAL EXPENSE (已發生開銷總覽) */}
          {activeTab === "actual_expense" && (
            <div>
              {/* Summary Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                  <div style={{ fontSize: 12, color: "#fca5a5" }}>本月已付總開銷</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", marginTop: 4 }}>
                    <Amount value={actualExpenseMinor} currency={baseCurrency} />
                  </div>
                </div>

                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                  <div style={{ fontSize: 12, color: "#c7d2fe" }}>💳 信用卡請款開銷 (77 筆)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#818cf8", fontFamily: "monospace", marginTop: 4 }}>
                    <Amount value={creditExpenseTotal} currency={baseCurrency} />
                  </div>
                </div>

                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <div style={{ fontSize: 12, color: "#6ee7b7" }}>🏦 活存帳戶自動扣繳 (1 筆)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#34d399", fontFamily: "monospace", marginTop: 4 }}>
                    <Amount value={actualExpenseMinor > creditExpenseTotal ? actualExpenseMinor - creditExpenseTotal : 0n} currency={baseCurrency} />
                  </div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["all", "credit", "bank"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setExpenseFilter(f)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1px solid",
                        borderColor: expenseFilter === f ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.08)",
                        background: expenseFilter === f ? "rgba(255, 255, 255, 0.15)" : "transparent",
                        color: expenseFilter === f ? "var(--fg)" : "var(--muted)",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {f === "all" ? "全部交易" : f === "credit" ? "💳 僅信用卡" : "🏦 僅活存扣繳"}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="搜尋消費備註、分類或帳戶..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "var(--fg)",
                    fontSize: 12,
                    minWidth: 200,
                  }}
                />
              </div>

              {/* Transaction List */}
              <TransactionListTable
                items={expenseItems}
                currency={baseCurrency}
                onOpenPicker={(t) =>
                  setPickerTarget({
                    id: t.id,
                    categoryId: t.categoryId ?? null,
                    note: t.note || "消費紀錄",
                  })
                }
              />
            </div>
          )}

          {/* TAB 2: EXPECTED EXPENSE (預期開銷與預算) */}
          {activeTab === "expected_expense" && (() => {
            const rawUpcoming = (upcomingBillsQuery.data ?? []) as UpcomingBillItem[];
            const expenseBills = rawUpcoming.filter(
              (b) => b.kind === "expense" || b.kind === "transfer"
            );
            const thisMonthBills = expenseBills.filter((b) => b.date.startsWith(selectedMonth));
            const nextMonthBills = expenseBills.filter((b) => !b.date.startsWith(selectedMonth));
            const pendingBudgets = (pendingBudgetsQuery.data?.items ?? []) as PendingBudgetItem[];

            const thisMonthBillsTotalMinor = thisMonthBills.reduce((acc, b) => acc + BigInt(b.amountMinor), 0n);
            const pendingBudgetsTotalMinor = pendingBudgets.reduce((acc, b) => acc + BigInt(b.estimatedAmount) * 100n, 0n);
            const monthNumber = selectedMonth.slice(5).replace(/^0/, "");

            if (upcomingBillsQuery.isLoading || pendingBudgetsQuery.isLoading) {
              return <div style={{ color: "var(--muted)", fontSize: 12, padding: 16 }}>載入排程與預算明細中...</div>;
            }

            return (
              <div>
                <div style={{ padding: "16px", borderRadius: 10, background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>本月預期發生開銷構成</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fbbf24", fontFamily: "monospace" }}>
                      <Amount value={expectedExpenseMinor} currency={baseCurrency} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.6, marginBottom: 12 }}>
                    預期開銷 <strong>{fmt(expectedExpenseMinor, baseCurrency)}</strong> 是由本月
                    {thisMonthBills.length > 0 && (
                      <>「待扣排程支出 <strong>{fmt(thisMonthBillsTotalMinor, baseCurrency)}</strong>」</>
                    )}
                    {thisMonthBills.length > 0 && pendingBudgets.length > 0 && " 加上 "}
                    {pendingBudgets.length > 0 && (
                      <>「{monthNumber} 月待繳固定生活預算 <strong>{fmt(pendingBudgetsTotalMinor, baseCurrency)}</strong>」</>
                    )}
                    精確構成：
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>① 排程待扣支出（{thisMonthBills.length} 筆）</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace", marginTop: 2 }}>
                        {fmt(thisMonthBillsTotalMinor, baseCurrency)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={thisMonthBills.map((b) => `${b.name} ${fmt(BigInt(b.amountMinor), b.currency)}`).join(" + ")}>
                        {thisMonthBills.length > 0
                          ? thisMonthBills.map((b) => `${b.name} ${fmt(BigInt(b.amountMinor), b.currency)}`).join(" + ")
                          : "本月無待扣排程"}
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>② {monthNumber} 月固定生活預算待繳（{pendingBudgets.length} 筆）</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace", marginTop: 2 }}>
                        {fmt(pendingBudgetsTotalMinor, baseCurrency)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={pendingBudgets.map((b) => `${b.name} $${b.estimatedAmount}`).join(" + ")}>
                        {pendingBudgets.length > 0
                          ? pendingBudgets.map((b) => `${b.name} $${b.estimatedAmount}`).join(" + ")
                          : "預算已全數核銷"}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Section 1: This Month Pending Bills */}
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>🏠</span>
                        <span>① 本月待扣支出排程（房貸／定期轉帳）</span>
                      </h4>
                      {thisMonthBills.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {thisMonthBills.map((bill, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "10px 14px",
                                borderRadius: 8,
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(245, 158, 11, 0.2)",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>{bill.name}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                  {bill.kind === "transfer" ? "預計轉帳日" : "預計扣款日"}：{bill.date}
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#f59e0b" }}>
                                {fmt(BigInt(bill.amountMinor), bill.currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: "12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", color: "var(--muted)", fontSize: 12 }}>
                          本月月底前無待執行的支出扣繳排程。
                        </div>
                      )}
                    </div>

                    {/* Section 2: This Month Pending Fixed Budgets */}
                    <div>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📋</span>
                        <span>② {monthNumber} 月固定生活預算待繳項目（水電瓦斯與管理費）</span>
                      </h4>
                      {pendingBudgets.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {pendingBudgets.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "9px 14px",
                                borderRadius: 8,
                                background: "rgba(255, 255, 255, 0.03)",
                                border: "1px solid rgba(56, 189, 248, 0.15)",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>{item.name}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{monthNumber} 月預算保留額度</div>
                              </div>
                              <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#38bdf8" }}>
                                $ {item.estimatedAmount}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: "12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", color: "var(--muted)", fontSize: 12 }}>
                          {monthNumber} 月所有固定生活預算均已核銷完畢。
                        </div>
                      )}
                    </div>

                    {/* Section 3: Next Month Early Preview */}
                    {nextMonthBills.length > 0 && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <h4 style={{ margin: 0, fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
                            <span>🔜</span>
                            <span>次月月初排程預告（未來 30 天內）</span>
                          </h4>
                          <span style={{ fontSize: 11, color: "var(--muted)", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 10 }}>
                            不計入 {monthNumber} 月開銷
                          </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {nextMonthBills.map((bill, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "9px 14px",
                                borderRadius: 8,
                                background: "rgba(255, 255, 255, 0.02)",
                                border: "1px solid rgba(255, 255, 255, 0.05)",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 500, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{bill.name}</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                  {bill.kind === "transfer" ? "預計轉帳日" : "下次扣款日"}：{bill.date}
                                </div>
                              </div>
                              <div style={{ fontWeight: 600, fontFamily: "monospace", color: "var(--muted)" }}>
                                {fmt(BigInt(bill.amountMinor), bill.currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: "var(--muted)", background: "rgba(0,0,0,0.2)", padding: "10px 14px", borderRadius: 8, lineHeight: 1.5 }}>
                      💡 <strong>定期轉帳說明</strong>：孝親（每月 10 號）、宜宸（每月 1 號）、涵筠（每月 1 號）為銀行固定轉帳項目。若 {monthNumber} 月份的款項您已實際自網銀轉帳付出，可至帳戶交易頁補記入帳，系統便會將其列入本月已支出。
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Link
                    href="/budgets"
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      background: "rgba(255, 255, 255, 0.1)",
                      color: "var(--fg)",
                      fontSize: 13,
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    前往年度預算與固定開銷全景 ➔
                  </Link>
                </div>
              </div>
            );
          })()}

          {/* TAB 3: INCOME (預估收入與薪資單結構) */}
          {activeTab === "income" && (
            <div>
              <div style={{ padding: "16px", borderRadius: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>本月實領收入淨額（發薪日待到帳）</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#10b981", fontFamily: "monospace" }}>
                    <Amount value={totalProjectedIncomeMinor} currency={baseCurrency} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  💡 系統已綁定固定薪資單結構，於每月 25 日自動撥入「中國信託商業銀行」活存帳戶。
                </div>
              </div>

              {/* Payroll Profiles */}
              {payrollQuery.isLoading ? (
                <div style={{ color: "var(--muted)", padding: 16 }}>載入薪資單結構中...</div>
              ) : payrollQuery.data && payrollQuery.data.length > 0 ? (
                <div>
                  {payrollQuery.data.map((p) => {
                    const earnings = p.lines.filter((l) => l.kind === "earning");
                    const deductions = p.lines.filter((l) => l.kind === "deduction");

                    return (
                      <div
                        key={p.id}
                        style={{
                          borderRadius: 10,
                          background: "rgba(0, 0, 0, 0.25)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          padding: "16px",
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, borderBottom: "1px solid rgba(255, 255, 255, 0.06)", paddingBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>📋 {p.name} 薪資單結構</span>
                            <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                              每月 {p.dayOfMonth} 日發薪
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            下次撥款日：{p.nextRunDate}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {/* Earnings */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#34d399", marginBottom: 8 }}>應領薪資項目</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {earnings.map((e) => (
                                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 6 }}>
                                  <span style={{ color: "var(--fg)" }}>{e.name}</span>
                                  <span style={{ fontFamily: "monospace", color: "#34d399", fontWeight: 600 }}>
                                    + {fmt(BigInt(e.amountMinor), p.currency)}
                                  </span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", borderTop: "1px dashed rgba(255,255,255,0.1)", marginTop: 4 }}>
                                <span style={{ color: "var(--muted)" }}>應發總額</span>
                                <span style={{ fontFamily: "monospace", color: "#34d399", fontWeight: 700 }}>
                                  {fmt(p.totals.earningsMinor, p.currency)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Deductions */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#f87171", marginBottom: 8 }}>法定扣除項目</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {deductions.map((d) => (
                                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 6 }}>
                                  <span style={{ color: "var(--fg)" }}>{d.name}</span>
                                  <span style={{ fontFamily: "monospace", color: "#f87171", fontWeight: 600 }}>
                                    - {fmt(BigInt(d.amountMinor), p.currency)}
                                  </span>
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 10px", borderTop: "1px dashed rgba(255,255,255,0.1)", marginTop: 4 }}>
                                <span style={{ color: "var(--muted)" }}>扣除總額</span>
                                <span style={{ fontFamily: "monospace", color: "#f87171", fontWeight: 700 }}>
                                  - {fmt(p.totals.deductionsMinor, p.currency)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Net Pay Total Bar */}
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>實領入帳金額 (Net Pay)</span>
                          <span style={{ fontSize: 20, fontWeight: 800, color: "#10b981", fontFamily: "monospace" }}>
                            {fmt(p.totals.netMinor, p.currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: 16, color: "var(--muted)" }}>尚無設定薪資單。</div>
              )}

              {/* Section: Upcoming RSU Stocks */}
              {(() => {
                const rawUpcoming = (upcomingBillsQuery.data ?? []) as UpcomingBillItem[];
                const rsuBills = rawUpcoming.filter((b) => b.kind === "rsu");
                if (rsuBills.length === 0) return null;
                return (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "#c084fc", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📈</span>
                      <span>本月待歸屬受限股票（RSU / 獨立證券帳戶計算）</span>
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rsuBills.map((rsu, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: "rgba(168, 85, 247, 0.08)",
                            border: "1px solid rgba(168, 85, 247, 0.2)",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>{rsu.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                              預計歸屬日：{rsu.date} · 數量：{rsu.note}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#c084fc", fontSize: 14 }}>
                              {BigInt(rsu.amountMinor) > 0n ? fmt(BigInt(rsu.amountMinor), rsu.currency || "USD") : "待歸屬"}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                              歸入獨立證券帳戶 · 不混入現金流
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: 6, lineHeight: 1.5 }}>
                      💡 <strong>股票獨立帳戶說明</strong>：RSU 為公司股票資產，歸屬後存於您的專屬「證券/投資帳戶」獨立管理與換算淨值，不會併入銀行活存作為可動支現金流。
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: CREDIT (信用卡全卡帳單與分期負擔) */}
          {activeTab === "credit" && (
            <div>
              {/* Card Summary Boxes */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ padding: "14px 18px", borderRadius: 10, background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.25)" }}>
                  <div style={{ fontSize: 12, color: "#c7d2fe" }}>💳 中國信託商業銀行 (75 筆)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#818cf8", fontFamily: "monospace", margin: "4px 0" }}>
                    $ 77,036
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    含日立冰箱 $8,083、綜所稅 $8,305、書桌 $3,174 等
                  </div>
                </div>

                <div style={{ padding: "14px 18px", borderRadius: 10, background: "rgba(59, 130, 246, 0.12)", border: "1px solid rgba(59, 130, 246, 0.25)" }}>
                  <div style={{ fontSize: 12, color: "#bfdbfe" }}>💳 台北富邦商業銀行 (2 筆)</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa", fontFamily: "monospace", margin: "4px 0" }}>
                    $ 30,354
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    富邦人壽保費 $29,067 + 電話費 $1,287
                  </div>
                </div>
              </div>

              {/* Installment Payoff Alert Box */}
              <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>🎉</span>
                <div style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.5 }}>
                  <strong>好消息：9 月份有多筆分期付款迎來最後一期（06/06 結清）！</strong>
                  <br />
                  日立冰箱 ($8,083)、升降書桌 ($3,174)、今網寬頻 ($1,483) 於本期全數結清，<strong>下個月（10 月）起固定信用卡負擔將直接減輕 $12,740</strong>！
                </div>
              </div>

              {/* Transactions List Filter */}
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="搜尋信用卡消費..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "var(--fg)",
                    fontSize: 12,
                    width: "100%",
                    maxWidth: 300,
                  }}
                />
              </div>

              <TransactionListTable
                items={expenseItems}
                currency={baseCurrency}
                onOpenPicker={(t) =>
                  setPickerTarget({
                    id: t.id,
                    categoryId: t.categoryId ?? null,
                    note: t.note || "消費紀錄",
                  })
                }
              />
            </div>
          )}

          {/* TAB 5: PROJECTED BALANCE (收支結餘與現金流試算) */}
          {activeTab === "projected_balance" && (
            <div>
              <div style={{ padding: "20px", borderRadius: 12, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: 16, color: "var(--fg)" }}>📊 全月收支結餘試算方程式</h3>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#34d399" }}>🟢 預期總收入</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981", fontFamily: "monospace", marginTop: 4 }}>
                      <Amount value={totalProjectedIncomeMinor} currency={baseCurrency} />
                    </div>
                  </div>

                  <div style={{ fontSize: 20, color: "var(--muted)" }}>➖</div>

                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#fca5a5" }}>🔴 預期總支出</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#ef4444", fontFamily: "monospace", marginTop: 4 }}>
                      <Amount value={totalProjectedExpenseMinor} currency={baseCurrency} />
                    </div>
                  </div>

                  <div style={{ fontSize: 20, color: "var(--muted)" }}>🟰</div>

                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#93c5fd" }}>🔵 全月預估結餘</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: projectedNetChange >= 0n ? "#34d399" : "#ef4444", fontFamily: "monospace", marginTop: 4 }}>
                      <Amount value={projectedNetChange} currency={baseCurrency} signed />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                  • <strong>目前已實現淨額（收 - 支）</strong>：<span style={{ color: "#ef4444", fontWeight: 700 }}>{fmt(actualNetChange, baseCurrency)}</span>
                  <br />
                  • 說明：由於 9 月份薪資預計於 9/25 發薪日入帳，在尚未到帳前，系統暫時反映已支出開銷之淨變動；待 9/25 薪資入帳後，全月實現淨額將迅速回升轉為正盈餘！
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: NET WORTH (總淨資產結構) */}
          {activeTab === "net_worth" && (
            <div>
              <div style={{ padding: "16px", borderRadius: 10, background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.25)", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#d8b4fe" }}>💎 個人總淨資產 (Net Worth)</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#c084fc", fontFamily: "monospace", marginTop: 4 }}>
                    <Amount value={netWorthTotal} currency={baseCurrency} />
                  </div>
                </div>
                <Link
                  href="/net-worth"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 6,
                    background: "rgba(168, 85, 247, 0.2)",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                    color: "#f3e8ff",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  前往完整資產負債分析 ➔
                </Link>
              </div>

              {/* Net Worth breakdown */}
              {netWorthQuery.isLoading ? (
                <div style={{ color: "var(--muted)", padding: 16 }}>載入資產結構中...</div>
              ) : netWorthQuery.data ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>🏦 銀行流動性資產與現鈔</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      包含中國信託活存、台北富邦活存，以及持有的 JPY、HKD 外幣現鈔，提供日常開銷與緊急備用金之流動性防禦。
                    </div>
                  </div>

                  <div style={{ padding: "12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>💳 信用卡未結款負債</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      反映當前信用卡已刷卡但尚未扣款之負債總額，於次月帳單日扣款時自動結清。
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Cascading Two-Column Category Picker Modal */}
      <CategoryPickerModal
        isOpen={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        categories={allCategories}
        currentCategoryId={pickerTarget?.categoryId}
        transactionNote={pickerTarget?.note}
        kind="expense"
        onSelect={(newCatId) => {
          if (pickerTarget && newCatId !== pickerTarget.categoryId) {
            updateMutation.mutate({
              id: pickerTarget.id,
              categoryId: newCatId || null,
            });
          }
        }}
      />
    </div>
  );
}

// Sub-component: Transaction Table
function TransactionListTable({
  items,
  currency,
  onOpenPicker,
}: {
  items: TransactionListItem[];
  currency: string;
  onOpenPicker: (t: TransactionListItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        查無符合條件的明細交易紀錄。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((t) => {
        const d = new Date(t.occurredAt);
        const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              gap: 12,
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
          >
            {/* Left: Date & Note */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>{dateStr}</span>
                <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "var(--muted)" }}>
                  {t.accountName || "未知帳戶"}
                </span>
                {t.statementMonth && (
                  <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(99, 102, 241, 0.15)", color: "#a5b4fc" }}>
                    🗓️ {t.statementMonth} 帳單
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.note || "(無備註)"}
              </div>
            </div>

            {/* Middle: Category Tag (Click to edit with red outline when uncategorized) */}
            <div style={{ flexShrink: 0 }}>
              {(() => {
                const categoryLabel = t.parentCategoryName ? `${t.parentCategoryName} · ${t.categoryName}` : t.categoryName || "未分類";
                const isUncat = !t.categoryId || categoryLabel === "未分類" || !t.categoryName;
                return (
                  <button
                    type="button"
                    onClick={() => onOpenPicker(t)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: isUncat ? "rgba(239, 68, 68, 0.16)" : "rgba(255, 255, 255, 0.06)",
                      border: isUncat ? "1.5px solid #ef4444" : "1px solid rgba(255, 255, 255, 0.12)",
                      color: isUncat ? "#fca5a5" : "var(--fg)",
                      boxShadow: isUncat ? "0 0 8px rgba(239, 68, 68, 0.28)" : "none",
                      fontWeight: isUncat ? 700 : 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (isUncat) {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.28)";
                        e.currentTarget.style.borderColor = "#f87171";
                      } else {
                        e.currentTarget.style.background = "rgba(99, 102, 241, 0.25)";
                        e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.5)";
                        e.currentTarget.style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isUncat) {
                        e.currentTarget.style.background = "rgba(239, 68, 68, 0.16)";
                        e.currentTarget.style.borderColor = "#ef4444";
                      } else {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.12)";
                        e.currentTarget.style.color = "var(--fg)";
                      }
                    }}
                    title="點擊修改分類"
                  >
                    <span>🏷️</span>
                    <span>{categoryLabel}</span>
                    <span style={{ fontSize: 9, opacity: isUncat ? 0.9 : 0.5 }}>✏️</span>
                  </button>
                );
              })()}
            </div>

            {/* Right: Amount */}
            <div style={{ flexShrink: 0, textAlign: "right", minWidth: 90 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", fontFamily: "monospace" }}>
                - {fmt(BigInt(t.amountMinor), currency)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
