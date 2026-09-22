"use client";

import { TopBar } from "@/components/TopBar";
import { TransactionList } from "@/components/TransactionList";
import { AccountOptions } from "@/components/AccountOptions";
import { CategoryOptions } from "@/components/CategoryOptions";
import { QuickButtonsBar } from "@/components/QuickButtonsBar";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { fmt } from "@/lib/format";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ImportCsvModal } from "@/components/ImportCsvModal";
import { CreditTransactionGroupedList } from "@/components/CreditTransactionGroupedList";
import { CreditCardSelector } from "@/components/CreditCardSelector";
import { CreditTransactionModal } from "@/components/CreditTransactionModal";

const PAGE = 50;
type Cursor = { occurredAt: string; id: string } | null;

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar />
          <div className="container muted">載入中…</div>
        </>
      }
    >
      <TransactionsInner />
    </Suspense>
  );
}

function TransactionsInner() {
  const { ready } = useAuthGuard();
  const params = useSearchParams();

  const initialAccount = params.get("account") ?? "";
  const initialMonth = params.get("month") ?? "";
  const initialView = (params.get("view") as "split" | "single") || "split";

  const [viewMode, setViewMode] = useState<"split" | "single">(initialView);

  // Shared filters
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const [month, setMonth] = useState(initialMonth);
  const [search, setSearch] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);

  // Single view state (for viewing all transactions, incomes, transfers)
  const [type, setType] = useState<"" | "income" | "expense" | "transfer">(
    (params.get("type") as "" | "income" | "expense" | "transfer") || "",
  );
  const [singleAccountId, setSingleAccountId] = useState(initialAccount);
  const [singleCursorStack, setSingleCursorStack] = useState<Cursor[]>([null]);
  const currentSingleCursor = singleCursorStack[singleCursorStack.length - 1] ?? null;
  const singlePageNum = singleCursorStack.length;

  // Split view: Left Panel (General Expenses)
  const [generalAccountId, setGeneralAccountId] = useState("");

  // Split view: Right Panel (Credit Card Expenses)
  const [creditCardId, setCreditCardId] = useState("");

  const accounts = trpc.accounts.list.useQuery(undefined, { enabled: ready });
  const categories = trpc.categories.list.useQuery(undefined, { enabled: ready });
  const upcoming = trpc.transactions.upcoming.useQuery(undefined, { enabled: ready });
  const utils = trpc.useUtils();

  const allAccounts = useMemo(() => accounts.data ?? [], [accounts.data]);
  const creditAccounts = useMemo(
    () => allAccounts.filter((a) => a.type === "credit"),
    [allAccounts],
  );
  const generalAccounts = useMemo(
    () => allAccounts.filter((a) => a.type !== "credit" && a.type !== "loan" && a.type !== "mortgage"),
    [allAccounts],
  );

  // Initialize initial account selection if coming from navigation
  useEffect(() => {
    if (initialAccount) {
      if (initialAccount.includes(",")) {
        setCreditCardId("");
      } else {
        const isCredit = creditAccounts.some((c) => c.id === initialAccount);
        if (isCredit) {
          setCreditCardId(initialAccount);
        } else {
          setGeneralAccountId(initialAccount);
        }
      }
    }
  }, [initialAccount, creditAccounts]);

  // Query 1: Single view list (with legacy/single pagination)
  const singleFilters = useMemo(
    () => ({
      limit: PAGE,
      cursor: currentSingleCursor ?? undefined,
      type: type || undefined,
      accountIds: singleAccountId ? (singleAccountId.includes(",") ? singleAccountId.split(",") : singleAccountId) : undefined,
      categoryId: categoryId || undefined,
      month: month || undefined,
      search: search.trim() || undefined,
    }),
    [type, singleAccountId, categoryId, month, search, currentSingleCursor],
  );
  const singleList = trpc.transactions.list.useQuery(singleFilters, {
    enabled: ready && viewMode === "single",
  });

  // Query 2: Split view - Left Panel (General Expenses) - Show all without pagination
  const generalFilters = useMemo(
    () => ({
      limit: 1000,
      type: "expense" as const,
      accountIds: generalAccountId ? [generalAccountId] : undefined,
      excludeAccountTypes: generalAccountId ? undefined : (["credit"] as Array<"credit">),
      categoryId: categoryId || undefined,
      month: month || undefined,
      search: search.trim() || undefined,
    }),
    [generalAccountId, categoryId, month, search],
  );
  const generalList = trpc.transactions.list.useQuery(generalFilters, {
    enabled: ready && viewMode === "split",
  });

  // Default to first credit card if none selected
  useEffect(() => {
    if (!creditCardId && creditAccounts.length > 0 && creditAccounts[0]?.id) {
      setCreditCardId(creditAccounts[0].id);
    }
  }, [creditAccounts, creditCardId]);

  // Query 3: Split view - Right Panel (Credit Card Expenses) - Show all without pagination
  const creditFilters = useMemo(
    () => ({
      limit: 1000,
      type: "expense" as const,
      accountIds: creditCardId ? [creditCardId] : undefined,
      accountTypes: creditCardId ? undefined : (["credit"] as Array<"credit">),
      categoryId: categoryId || undefined,
      month: month || undefined,
      search: search.trim() || undefined,
    }),
    [creditCardId, categoryId, month, search],
  );
  const creditList = trpc.transactions.list.useQuery(creditFilters, {
    enabled: ready && viewMode === "split",
  });

  // Query 4: All credit cards expenses across the month (for grand total 加總 and per-card amounts)
  const allCreditList = trpc.transactions.list.useQuery(
    {
      limit: 1000,
      type: "expense",
      accountTypes: ["credit"],
      categoryId: categoryId || undefined,
      month: month || undefined,
      search: search.trim() || undefined,
    },
    { enabled: ready && viewMode === "split" },
  );

  // Credit upcoming bills for selected card
  const creditUpcoming = useMemo(() => {
    if (!upcoming.data) return [];
    const targetCardIds = creditCardId ? [creditCardId] : creditAccounts.map((c) => c.id).filter(Boolean);
    const thisMonthStr = month || new Date().toISOString().slice(0, 7);
    return upcoming.data.filter((u) => {
      const matchAcc =
        (u.sourceAccountId && targetCardIds.includes(u.sourceAccountId)) ||
        (u.transferAccountId && targetCardIds.includes(u.transferAccountId));
      return matchAcc && (u.date.startsWith(thisMonthStr) || !u.paid);
    });
  }, [upcoming.data, creditCardId, creditAccounts, month]);

  // All upcoming bills across all credit cards
  const allCreditUpcoming = useMemo(() => {
    if (!upcoming.data) return [];
    const allCardIds = creditAccounts.map((c) => c.id).filter(Boolean);
    const thisMonthStr = month || new Date().toISOString().slice(0, 7);
    return upcoming.data.filter((u) => {
      const matchAcc =
        (u.sourceAccountId && allCardIds.includes(u.sourceAccountId)) ||
        (u.transferAccountId && allCardIds.includes(u.transferAccountId));
      return matchAcc && (u.date.startsWith(thisMonthStr) || !u.paid);
    });
  }, [upcoming.data, creditAccounts, month]);

  // Selected card expense calculations (actual + upcoming)
  const actualCreditExpenseMinor = useMemo(() => {
    if (!creditList.data?.items) return 0n;
    return creditList.data.items.reduce((acc, t) => {
      if (t.type === "expense") {
        return acc + BigInt(t.amountMinor);
      }
      return acc;
    }, 0n);
  }, [creditList.data?.items]);

  const upcomingCreditExpenseMinor = useMemo(() => {
    return creditUpcoming.reduce((acc, u) => {
      if (!u.paid && u.kind === "expense") {
        return acc + BigInt(u.amountMinor);
      }
      return acc;
    }, 0n);
  }, [creditUpcoming]);

  const totalCreditExposureMinor = actualCreditExpenseMinor + upcomingCreditExpenseMinor;

  // Grand total calculations for ALL credit cards (信用卡支出加總)
  const allCardsActualExpenseMinor = useMemo(() => {
    if (!allCreditList.data?.items) return 0n;
    return allCreditList.data.items.reduce((acc, t) => {
      if (t.type === "expense") {
        return acc + BigInt(t.amountMinor);
      }
      return acc;
    }, 0n);
  }, [allCreditList.data?.items]);

  const allCardsUpcomingExpenseMinor = useMemo(() => {
    return allCreditUpcoming.reduce((acc, u) => {
      if (!u.paid && u.kind === "expense") {
        return acc + BigInt(u.amountMinor);
      }
      return acc;
    }, 0n);
  }, [allCreditUpcoming]);

  const allCardsTotalExposureMinor = allCardsActualExpenseMinor + allCardsUpcomingExpenseMinor;

  // Map of cardId -> total actual expense
  const cardTotalsMap = useMemo(() => {
    const map: Record<string, bigint> = {};
    if (allCreditList.data?.items) {
      for (const t of allCreditList.data.items) {
        if (t.type === "expense" && t.accountId) {
          map[t.accountId] = (map[t.accountId] || 0n) + BigInt(t.amountMinor);
        }
      }
    }
    return map;
  }, [allCreditList.data?.items]);

  const creditCurrency = useMemo(() => {
    if (creditCardId) {
      const card = creditAccounts.find((c) => c.id === creditCardId);
      if (card?.currency) return card.currency;
    }
    return creditList.data?.items?.[0]?.currency || "TWD";
  }, [creditCardId, creditAccounts, creditList.data?.items]);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 36; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const val = `${y}-${m}`;
      let label = `${y} 年 ${m} 月`;
      if (i === 0) label += " (本月)";
      else if (i === 1) label += " (上月)";
      options.push({ value: val, label });
    }
    return options;
  }, []);

  const resetAllPages = () => {
    setSingleCursorStack([null]);
  };

  const invalidateAll = () =>
    Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.monthlyBreakdown.invalidate(),
      utils.accounts.listWithBalances.invalidate(),
      utils.netWorth.summary.invalidate(),
    ]);

  if (!ready) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container">
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 4px" }}>交易紀錄</h2>
            <p className="muted" style={{ margin: 0 }}>
              左右雙欄對帳模式：左側掌握一般日常支出，右側隨時切換信用卡請款明細。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={() => setImportModalOpen(true)}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              📥 匯入中信 / 信用卡 CSV
            </button>
          </div>
        </div>

        {/* Quick Utility Buttons */}
        <QuickButtonsBar
          month={month || undefined}
          onTransactionCreated={async () => {
            await invalidateAll();
          }}
        />

        {/* Global Filter Bar */}
        <div className="card" style={{ marginBottom: 20 }}>
          {/* Top Row: View Mode Switcher + Clear Button */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 10,
              borderBottom: "1px solid var(--border)",
              paddingBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>版型切換：</span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setViewMode("split")}
                style={{
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: viewMode === "split" ? 700 : 400,
                  background: viewMode === "split" ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  border: viewMode === "split" ? "1px solid var(--primary)" : "1px solid transparent",
                  color: viewMode === "split" ? "var(--fg)" : "var(--muted)",
                  borderRadius: 8,
                }}
              >
                ⫴ 左右雙欄對帳模式 (一般 vs 信用卡)
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setViewMode("single")}
                style={{
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: viewMode === "single" ? 700 : 400,
                  background: viewMode === "single" ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  border: viewMode === "single" ? "1px solid var(--primary)" : "1px solid transparent",
                  color: viewMode === "single" ? "var(--fg)" : "var(--muted)",
                  borderRadius: 8,
                }}
              >
                ☰ 單欄全明細清單
              </button>
            </div>

            {(categoryId || month || search || (viewMode === "single" && (type || singleAccountId))) && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setType("");
                  setSingleAccountId("");
                  setGeneralAccountId("");
                  setCreditCardId("");
                  setCategoryId("");
                  setMonth("");
                  setSearch("");
                  resetAllPages();
                }}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  color: "var(--muted)",
                  borderRadius: 6,
                }}
              >
                ✕ 清除篩選條件
              </button>
            )}
          </div>

          {/* Filter Controls Row */}
          <div className="grid cols-3" style={{ gap: 12 }}>
            <label>
              月份
              <select
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  resetAllPages();
                }}
              >
                <option value="">全部月份</option>
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              支出分類
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  resetAllPages();
                }}
              >
                <option value="">全部分類</option>
                <CategoryOptions categories={categories.data ?? []} kind="expense" omitNone />
                {viewMode === "single" && (
                  <CategoryOptions categories={categories.data ?? []} kind="income" omitNone />
                )}
              </select>
            </label>

            <label>
              備註搜尋
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetAllPages();
                }}
                placeholder="輸入關鍵字搜尋…"
              />
            </label>
          </div>

          {/* In single mode: extra type and account options */}
          {viewMode === "single" && (
            <div className="grid cols-2" style={{ gap: 12, marginTop: 12 }}>
              <label>
                交易類型
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as typeof type);
                    setSingleCursorStack([null]);
                  }}
                >
                  <option value="">全部類型 (支出 / 收入 / 轉帳)</option>
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                  <option value="transfer">轉帳</option>
                </select>
              </label>
              <label>
                指定帳戶
                <select
                  value={singleAccountId}
                  onChange={(e) => {
                    setSingleAccountId(e.target.value);
                    setSingleCursorStack([null]);
                  }}
                >
                  <option value="">全部帳戶</option>
                  <AccountOptions accounts={allAccounts} />
                </select>
              </label>
            </div>
          )}
        </div>

        {/* VIEW 1: Split View (左右雙欄對帳模式) */}
        {viewMode === "split" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            {/* Left Column: 🛒 一般支出 (現金 / 活存) */}
            <div className="card" style={{ margin: 0, padding: 18 }}>
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 12,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🛒</span> 一般支出 (現金 / 活存)
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    現金、銀行活存等即時扣款明細
                  </div>
                </div>

                {/* General Account Switcher */}
                <select
                  value={generalAccountId}
                  onChange={(e) => setGeneralAccountId(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                    outline: "none",
                  }}
                >
                  <option value="">全部一般帳戶 ({generalAccounts.length} 個)</option>
                  {generalAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>

              {/* Transactions List */}
              <TransactionList
                data={generalList.data?.items}
                loading={generalList.isLoading}
                accounts={allAccounts}
                categories={categories.data}
                invalidate={invalidateAll}
              />

              {/* General Transactions Footer (All loaded without pagination) */}
              {generalList.data?.items && generalList.data.items.length > 0 && (
                <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                  ✓ 已顯示全部 {generalList.data.items.length} 筆一般支出
                </div>
              )}
            </div>

            {/* Right Column: 💳 信用卡支出 (可切換信用卡) */}
            <div className="card" style={{ margin: 0, padding: 18 }}>
              {/* Header with 信用卡支出 加總 */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 10,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>💳</span> 信用卡支出
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    延後請款、帳單分期與卡片明細
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 12, padding: "6px 14px", fontWeight: 600 }}
                    onClick={() => setCreditModalOpen(true)}
                  >
                    ➕ 手動新增
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={() => setImportModalOpen(true)}
                  >
                    📥 匯入 CSV
                  </button>

                  <div style={{ textAlign: "right", marginLeft: 4 }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>全卡加總開銷 (含排程)</div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: allCardsTotalExposureMinor > 0n ? "#ef4444" : "var(--fg)",
                        fontFamily: "var(--font-mono, monospace)",
                        letterSpacing: "-0.5px",
                      }}
                    >
                      {fmt(-allCardsTotalExposureMinor, creditCurrency)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Realistic Credit Card Selector Buttons & Total Exposure Line */}
              <CreditCardSelector
                cards={creditAccounts}
                selectedCardId={creditCardId}
                onSelectCard={setCreditCardId}
                actualExpenseMinor={actualCreditExpenseMinor}
                upcomingExpenseMinor={upcomingCreditExpenseMinor}
                totalExposureMinor={totalCreditExposureMinor}
                currency={creditCurrency}
                cardTotalsMap={cardTotalsMap}
              />

              {/* Upcoming Scheduled Bills / Installments as a sleek matching Card */}
              {creditUpcoming.length > 0 && (
                <div
                  className="ff3-card"
                  style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderLeft: "4px solid var(--accent)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                      borderBottom: "1px solid var(--border)",
                      paddingBottom: 6,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>📌</span> 當期信用卡待繳 / 排程扣款
                    </span>
                    <span
                      style={{
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#a5b4fc",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        borderRadius: 10,
                        padding: "1px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {creditUpcoming.length} 筆待繳
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {creditUpcoming.map((u, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12,
                          padding: "4px 0",
                          borderBottom:
                            i < creditUpcoming.length - 1 ? "1px dashed rgba(255, 255, 255, 0.06)" : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{u.name}</span>
                          {u.paid ? (
                            <span className="badge" style={{ fontSize: 10, background: "rgba(255,255,255,0.1)" }}>
                              ✅ 已繳
                            </span>
                          ) : (
                            <span className="badge primary-badge" style={{ fontSize: 10 }}>
                              ⏳ 待繳
                            </span>
                          )}
                          {u.date && <span className="muted" style={{ fontSize: 11 }}>({u.date.slice(0, 10)})</span>}
                        </div>
                        <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--expense)" }}>
                          -{fmt(u.amountMinor, u.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day-Grouped Credit Transactions List (Compact, no redundant buttons) */}
              <CreditTransactionGroupedList
                data={creditList.data?.items}
                loading={creditList.isLoading}
                categories={categories.data}
                onManualAdd={() => setCreditModalOpen(true)}
                onImportCsv={() => setImportModalOpen(true)}
              />

              {/* Credit Transactions Footer (All loaded without pagination) */}
              {creditList.data?.items && creditList.data.items.length > 0 && (
                <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                  ✓ 已顯示全部 {creditList.data.items.length} 筆信用卡支出
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: Single View (傳統單欄全清單模式) */}
        {viewMode === "single" && (
          <div className="card" style={{ padding: 18 }}>
            <TransactionList
              data={singleList.data?.items}
              loading={singleList.isLoading}
              accounts={allAccounts}
              categories={categories.data}
              invalidate={invalidateAll}
            />

            <div
              className="row-inline"
              style={{
                justifyContent: "center",
                alignItems: "center",
                marginTop: 20,
                gap: 16,
              }}
            >
              <button
                type="button"
                className="btn ghost"
                disabled={singlePageNum <= 1}
                onClick={() => setSingleCursorStack((s) => s.slice(0, -1))}
                style={{ padding: "6px 14px" }}
              >
                ← 上一頁
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                第 <strong style={{ color: "var(--fg)" }}>{singlePageNum}</strong> 頁
                {singleList.data?.items ? `（本頁 ${singleList.data.items.length} 筆）` : ""}
              </span>
              <button
                type="button"
                className="btn ghost"
                disabled={!singleList.data?.hasMore}
                onClick={() => {
                  const next = singleList.data?.nextCursor ?? null;
                  setSingleCursorStack((s) => [...s, next]);
                }}
                style={{ padding: "6px 14px" }}
              >
                下一頁 →
              </button>
            </div>
          </div>
        )}

        {/* CSV Import Modal */}
        <ImportCsvModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onSuccess={async () => {
            await invalidateAll();
          }}
          accounts={allAccounts}
        />

        {/* Manual Credit Transaction & Installment Modal */}
        <CreditTransactionModal
          open={creditModalOpen}
          onClose={() => setCreditModalOpen(false)}
          defaultAccountId={creditCardId}
          creditAccounts={creditAccounts}
          month={month || undefined}
          onSuccess={async () => {
            await invalidateAll();
          }}
        />
      </div>
    </>
  );
}
