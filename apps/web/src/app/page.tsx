"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { todayYearMonth } from "@/lib/labels";

import dynamic from "next/dynamic";
import { TopBar } from "@/components/TopBar";
import { TransactionList } from "@/components/TransactionList";
import { CreditTransactionGroupedList } from "@/components/CreditTransactionGroupedList";
import { CreditCardSelector } from "@/components/CreditCardSelector";
import { SkeletonCard, SkeletonList } from "@/components/Skeleton";
import { DashboardStats } from "@/components/dashboard/DashboardStats";
import { DashboardAccountOverview } from "@/components/dashboard/DashboardAccountOverview";
import { DashboardPendingExpenses } from "@/components/dashboard/DashboardPendingExpenses";
import { PieChart } from "@/components/PieChart";
import { currencyExponent } from "@acc/money";
import { fmt } from "@/lib/format";

const QuickEntry = dynamic(
  () => import("@/components/QuickEntry").then((mod) => mod.QuickEntry),
  { ssr: false }
);
const CreditTransactionModal = dynamic(
  () => import("@/components/CreditTransactionModal").then((mod) => mod.CreditTransactionModal),
  { ssr: false }
);
const CategoryTransactionsModal = dynamic(
  () => import("@/components/CategoryTransactionsModal").then((mod) => mod.CategoryTransactionsModal),
  { ssr: false }
);

export default function HomePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [selectedMonth, setSelectedMonth] = useState(() => todayYearMonth());
  const [baseCurrency, setBaseCurrency] = useState<string>("TWD");
  const [quickOpen, setQuickOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [selectedCatModal, setSelectedCatModal] = useState<{
    title: string;
    categoryId?: string | null;
    categoryIds?: string[];
    totalAmountMinor?: bigint;
  } | null>(null);

  // Month navigation helper
  const navigateMonth = (direction: number) => {
    const parts = selectedMonth.split("-");
    const y = Number(parts[0] || 2026);
    const m = Number(parts[1] || 8);
    const d = new Date(y, m - 1 + direction, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, "0");
    setSelectedMonth(`${newY}-${newM}`);
  };

  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string>("");

  // Queries
  const balances = trpc.accounts.listWithBalances.useQuery(undefined, {
    enabled: !!session?.user,
    staleTime: 30_000,
  });
  const breakdown = trpc.transactions.monthlyBreakdown.useQuery(
    { month: selectedMonth, baseCurrency },
    { enabled: !!session?.user, staleTime: 30_000 }
  );
  const monthCats = trpc.transactions.monthCategories.useQuery(
    { month: selectedMonth, baseCurrency },
    { enabled: !!session?.user, staleTime: 30_000 }
  );
  const netWorth = trpc.netWorth.summary.useQuery(
    { baseCurrency },
    {
      enabled: !!session?.user,
      staleTime: 30_000,
    }
  );
  const [yearStr, monthStr] = selectedMonth.split("-");
  const targetYear = Number(yearStr) || new Date().getFullYear();
  const targetMonth = Number(monthStr) || new Date().getMonth() + 1;

  // Pending fixed budget items for the month (待確認固定支出)
  const pendingQuery = trpc.annualBudgets.pendingMonthlyItems.useQuery(
    { year: targetYear, month: targetMonth },
    { enabled: !!session?.user, staleTime: 10_000 }
  );

  // Cashflow projection for the month (全年月度收支現金流預算)
  const cashflow = trpc.annualBudgets.cashflowProjection.useQuery(
    { year: targetYear },
    { enabled: !!session?.user, staleTime: 30_000 }
  );

  const categories = trpc.categories.list.useQuery(undefined, {
    enabled: !!session?.user,
    staleTime: 60_000,
  });

  const accountsList = balances.data || [];
  const creditAccounts = useMemo(
    () => accountsList.filter((a) => a.type === "credit"),
    [accountsList]
  );

  // Left: 一般支出 (非信用卡，現金/活存等即時支出)
  const recentGeneral = trpc.transactions.list.useQuery(
    {
      limit: 15,
      type: "expense",
      month: selectedMonth,
      excludeAccountTypes: ["credit"],
    },
    { enabled: !!session?.user, staleTime: 10_000 }
  );

  // Default to first credit card if none selected
  useEffect(() => {
    if (!selectedCreditCardId && creditAccounts.length > 0 && creditAccounts[0]?.id) {
      setSelectedCreditCardId(creditAccounts[0].id);
    }
  }, [creditAccounts, selectedCreditCardId]);

  // Right: 信用卡支出 (指定信用卡)
  const recentCredit = trpc.transactions.list.useQuery(
    {
      limit: 200,
      type: "expense",
      month: selectedMonth,
      ...(selectedCreditCardId
        ? { accountIds: [selectedCreditCardId] }
        : { accountTypes: ["credit"] }),
    },
    { enabled: !!session?.user, staleTime: 10_000 }
  );

  // All credit expenses across all cards for the month (for grand total 加總 and per-card totals)
  const allCreditExpenses = trpc.transactions.list.useQuery(
    {
      limit: 1000,
      type: "expense",
      accountTypes: ["credit"],
      month: selectedMonth,
    },
    { enabled: !!session?.user, staleTime: 10_000 }
  );

  // Credit upcoming bills (for exposure calculation)
  const upcomingBills = trpc.transactions.upcoming.useQuery(undefined, {
    enabled: !!session?.user,
    staleTime: 30_000,
  });

  const creditUpcoming = useMemo(() => {
    if (!upcomingBills.data) return [];
    const targetCardIds = selectedCreditCardId ? [selectedCreditCardId] : creditAccounts.map((c) => c.id).filter(Boolean);
    return upcomingBills.data.filter((u) => {
      const matchAcc =
        (u.sourceAccountId && targetCardIds.includes(u.sourceAccountId)) ||
        (u.transferAccountId && targetCardIds.includes(u.transferAccountId));
      return matchAcc && (u.date.startsWith(selectedMonth) || !u.paid);
    });
  }, [upcomingBills.data, selectedCreditCardId, creditAccounts, selectedMonth]);

  const allCreditUpcoming = useMemo(() => {
    if (!upcomingBills.data) return [];
    const allCardIds = creditAccounts.map((c) => c.id).filter(Boolean);
    return upcomingBills.data.filter((u) => {
      const matchAcc =
        (u.sourceAccountId && allCardIds.includes(u.sourceAccountId)) ||
        (u.transferAccountId && allCardIds.includes(u.transferAccountId));
      return matchAcc && (u.date.startsWith(selectedMonth) || !u.paid);
    });
  }, [upcomingBills.data, creditAccounts, selectedMonth]);

  const actualCreditExpenseMinor = useMemo(() => {
    if (!recentCredit.data?.items) return 0n;
    return recentCredit.data.items.reduce((acc, t) => {
      if (t.type === "expense") {
        return acc + BigInt(t.amountMinor);
      }
      return acc;
    }, 0n);
  }, [recentCredit.data?.items]);

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
    if (!allCreditExpenses.data?.items) return 0n;
    return allCreditExpenses.data.items.reduce((acc, t) => {
      if (t.type === "expense") {
        return acc + BigInt(t.amountMinor);
      }
      return acc;
    }, 0n);
  }, [allCreditExpenses.data?.items]);

  const allCardsUpcomingExpenseMinor = useMemo(() => {
    return allCreditUpcoming.reduce((acc, u) => {
      if (!u.paid && u.kind === "expense") {
        return acc + BigInt(u.amountMinor);
      }
      return acc;
    }, 0n);
  }, [allCreditUpcoming]);

  const allCardsTotalExposureMinor = allCardsActualExpenseMinor + allCardsUpcomingExpenseMinor;

  const cardTotalsMap = useMemo(() => {
    const map: Record<string, bigint> = {};
    if (allCreditExpenses.data?.items) {
      for (const t of allCreditExpenses.data.items) {
        if (t.type === "expense" && t.accountId) {
          map[t.accountId] = (map[t.accountId] || 0n) + BigInt(t.amountMinor);
        }
      }
    }
    return map;
  }, [allCreditExpenses.data?.items]);

  const creditCurrency = useMemo(() => {
    if (selectedCreditCardId) {
      const card = creditAccounts.find((c) => c.id === selectedCreditCardId);
      if (card?.currency) return card.currency;
    }
    return recentCredit.data?.items?.[0]?.currency || "TWD";
  }, [selectedCreditCardId, creditAccounts, recentCredit.data?.items]);

  const pieChartGroups = useMemo(() => {
    if (!monthCats.data?.totals) return [];
    const exp = currencyExponent(monthCats.data.baseCurrency || "TWD");
    const divisor = 10 ** exp;
    const groupsMap = new Map<string, { parentName: string; items: { name: string; value: number; categoryId?: string | null }[] }>();
    for (const t of monthCats.data.totals) {
      const pName = t.parentName || "待分類項目";
      if (!groupsMap.has(pName)) {
        groupsMap.set(pName, { parentName: pName, items: [] });
      }
      groupsMap.get(pName)!.items.push({
        name: t.name,
        value: Number(t.expenseMinor) / divisor,
        categoryId: t.categoryId,
      });
    }
    return Array.from(groupsMap.values());
  }, [monthCats.data?.totals, monthCats.data?.baseCurrency]);

  const invalidateAll = async () => {
    await Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.monthlyBreakdown.invalidate(),
      utils.transactions.monthCategories.invalidate(),
      utils.accounts.listWithBalances.invalidate(),
      utils.netWorth.summary.invalidate(),
    ]);
  };

  // 1. 已經發生的開銷 (Actual Expenses Already Occurred)
  const actualExpenseMinor = breakdown.data ? BigInt(breakdown.data.expenseMinor) : 0n;

  // 2. 預期發生的開銷 (Expected Expenses for this month)
  // - 待確認固定預算支出 (Pending Fixed Annual Budgets)
  const pendingFixedExpensesMinor = useMemo(() => {
    return (
      pendingQuery.data?.items.reduce(
        (sum, item) => sum + BigInt(item.estimatedAmount) * 100n,
        0n
      ) ?? 0n
    );
  }, [pendingQuery.data?.items]);

  // - 信用卡排程待繳 (Upcoming Credit Card Bills)
  const pendingCreditExpensesMinor = allCardsUpcomingExpenseMinor;

  // - 其他未繳定期/分期/貸款排程 (Other Non-Credit Upcoming Bills)
  const otherUpcomingExpensesMinor = useMemo(() => {
    if (!upcomingBills.data) return 0n;
    const creditIds = creditAccounts.map((c) => c.id).filter(Boolean);
    return upcomingBills.data.reduce((sum, u) => {
      const isCredit =
        (u.sourceAccountId && creditIds.includes(u.sourceAccountId)) ||
        (u.transferAccountId && creditIds.includes(u.transferAccountId));
      if (!u.paid && u.kind === "expense" && !isCredit && u.date.startsWith(selectedMonth)) {
        return sum + BigInt(u.amountMinor);
      }
      return sum;
    }, 0n);
  }, [upcomingBills.data, creditAccounts, selectedMonth]);

  // Total Expected Expenses (預期發生的開銷)
  const expectedExpenseMinor = useMemo(() => {
    const sumUpcoming = pendingFixedExpensesMinor + pendingCreditExpensesMinor + otherUpcomingExpensesMinor;
    const targetMonthCashflow = cashflow.data?.forecastMonths.find((m) => m.month === targetMonth);

    if (targetMonthCashflow) {
      const projectedTotalExpense =
        targetMonthCashflow.fixedOutflowMinor + targetMonthCashflow.budgetOutflowMinor;
      const budgetRemaining =
        projectedTotalExpense > actualExpenseMinor
          ? projectedTotalExpense - actualExpenseMinor
          : 0n;
      return sumUpcoming > budgetRemaining ? sumUpcoming : budgetRemaining;
    }
    return sumUpcoming;
  }, [
    pendingFixedExpensesMinor,
    pendingCreditExpensesMinor,
    otherUpcomingExpensesMinor,
    cashflow.data?.forecastMonths,
    targetMonth,
    actualExpenseMinor,
  ]);

  // 本月總預計開銷 (已發生 + 預期發生)
  const totalProjectedExpenseMinor = actualExpenseMinor + expectedExpenseMinor;

  // 3. 收入 (Income)
  // 已經入帳的收入 (Actual Income)
  const actualIncomeMinor = breakdown.data ? BigInt(breakdown.data.incomeMinor) : 0n;

  // 預期發生的收入 (Expected Income e.g. 薪資發薪日待入帳)
  const expectedIncomeMinor = useMemo(() => {
    const targetMonthCashflow = cashflow.data?.forecastMonths.find((m) => m.month === targetMonth);
    const upcomingIncomeBills =
      upcomingBills.data?.reduce((sum, u) => {
        if (!u.paid && u.kind === "income" && u.date.startsWith(selectedMonth)) {
          return sum + BigInt(u.amountMinor);
        }
        return sum;
      }, 0n) ?? 0n;

    if (targetMonthCashflow?.inflowMinor) {
      const remainingProjected =
        targetMonthCashflow.inflowMinor > actualIncomeMinor
          ? targetMonthCashflow.inflowMinor - actualIncomeMinor
          : 0n;
      return upcomingIncomeBills > remainingProjected ? upcomingIncomeBills : remainingProjected;
    }
    return upcomingIncomeBills;
  }, [cashflow.data?.forecastMonths, targetMonth, actualIncomeMinor, upcomingBills.data, selectedMonth]);

  // 本月總預計收入 (已入帳 + 預期發生)
  const totalProjectedIncomeMinor = actualIncomeMinor + expectedIncomeMinor;

  // 4. 結餘與淨變動 (Net Cashflow)
  const actualNetChange = actualIncomeMinor - actualExpenseMinor;
  const projectedNetChange = totalProjectedIncomeMinor - totalProjectedExpenseMinor;
  const netWorthTotal = netWorth.data ? BigInt(netWorth.data.totalMinor) : 0n;

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div style={{ maxWidth: 1540, margin: "0 auto", padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <SkeletonCard />
          </div>
          <SkeletonList rows={5} />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div style={{ width: "100%", margin: "0 auto", padding: "20px 4px 90px" }}>
        
        {/* Month Selector & Page Title Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
              📊 財務儀表板 (Dashboard)
            </h2>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Firefly III 簡潔對帳模式 • 月度即時概況
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Multi-Currency Base Switcher */}
            <div
              className="ff3-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                margin: 0,
                background: "rgba(255, 255, 255, 0.04)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 2 }}>💱 幣別:</span>
              {(["TWD", "USD", "JPY", "EUR"] as const).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  className="btn ghost"
                  onClick={() => setBaseCurrency(curr)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: baseCurrency === curr ? 700 : 500,
                    background: baseCurrency === curr ? "rgba(255, 255, 255, 0.15)" : "transparent",
                    color: baseCurrency === curr ? "var(--fg)" : "var(--muted)",
                    borderRadius: 4,
                    border: baseCurrency === curr ? "1px solid var(--border)" : "1px solid transparent",
                  }}
                >
                  {curr}
                </button>
              ))}
            </div>

            {/* Month Navigation Pill */}
            <div
              className="ff3-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 14px",
                margin: 0,
              }}
            >
              <button
                type="button"
                className="btn ghost"
                style={{ padding: "2px 8px", fontSize: 14 }}
                onClick={() => navigateMonth(-1)}
              >
                ◀
              </button>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  fontFamily: "monospace",
                  letterSpacing: "0.5px",
                }}
              >
                📅 {selectedMonth}
              </span>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: "2px 8px", fontSize: 14 }}
                onClick={() => navigateMonth(1)}
              >
                ▶
              </button>
            </div>

            <button
              type="button"
              className="btn"
              style={{
                background: "var(--income)",
                color: "#000",
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 8,
              }}
              onClick={() => setQuickOpen(true)}
            >
              ＋ 快速記帳
            </button>
          </div>
        </div>

        {/* Quick Entry Modal / Drawer */}
        {quickOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              className="ff3-card"
              style={{ maxWidth: 520, width: "100%", border: "1px solid var(--accent)" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 10,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>＋ 快速新增交易</h3>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setQuickOpen(false)}
                >
                  ✕
                </button>
              </div>
              <QuickEntry
                onDone={() => {
                  invalidateAll();
                  setQuickOpen(false);
                }}
              />
            </div>
          </div>
        )}

        {/* 0. Pending Scheduled Budget Confirmations */}
        <DashboardPendingExpenses
          currentMonth={selectedMonth}
          onSettled={invalidateAll}
        />

        {/* 1. Firefly III Stat Cards */}
        <DashboardStats
          actualExpenseMinor={actualExpenseMinor}
          expectedExpenseMinor={expectedExpenseMinor}
          totalProjectedExpenseMinor={totalProjectedExpenseMinor}
          actualIncomeMinor={actualIncomeMinor}
          expectedIncomeMinor={expectedIncomeMinor}
          totalProjectedIncomeMinor={totalProjectedIncomeMinor}
          actualNetChange={actualNetChange}
          projectedNetChange={projectedNetChange}
          netWorthTotal={netWorthTotal}
          creditExpenseTotal={allCardsTotalExposureMinor}
          baseCurrency={baseCurrency}
          selectedMonth={selectedMonth}
        />

        {/* 1.5. Real Expense Categories Breakdown PieChart (Dual Concentric Donut Rings) */}
        <div className="ff3-card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🥧</span> 當月分類支出結構 ({selectedMonth})
            </h3>
          </div>

          {pieChartGroups.length > 0 && monthCats.data?.totals && monthCats.data.totals.some((t) => Number(t.expenseMinor) > 0) ? (
            <PieChart
              size={340}
              data={pieChartGroups}
              currency={monthCats.data.baseCurrency || "TWD"}
              onSelectCategory={({ parentName, subCategoryName, categoryId, categoryIds, totalAmount }) => {
                const exp = currencyExponent(monthCats.data.baseCurrency || "TWD");
                const totalMinor = totalAmount ? BigInt(Math.round(totalAmount * 10 ** exp)) : undefined;
                setSelectedCatModal({
                  title: subCategoryName ? `${parentName} · ${subCategoryName}` : parentName,
                  categoryId: categoryId,
                  categoryIds: categoryIds,
                  totalAmountMinor: totalMinor,
                });
              }}
            />
          ) : (
            <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 4 }}>
                {selectedMonth} 本月尚無支出交易紀錄
              </div>
              <div style={{ fontSize: 12 }}>
                您可以點擊右上角「＋ 快速記帳」新增一筆支出，或點擊月條導航 ◀ 切換至 2026-08 查看上個月分類圓餅圖。
              </div>
            </div>
          )}
        </div>

        {/* 2. Account Overview Cards (Assets, Credit Cards with Pay Modal, Mortgages) */}
        <DashboardAccountOverview accounts={accountsList} />

        {/* 3. Dual-Panel Recent Transactions: General vs Credit Card */}
        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* Left Column: 🛒 一般支出 */}
          <div className="ff3-card" style={{ margin: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                borderBottom: "1px solid var(--border)",
                paddingBottom: 12,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🛒</span> 一般支出 ({selectedMonth})
                </h3>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  現金、銀行活存等即時扣款明細
                </div>
              </div>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 12 }}
                onClick={() => router.push(`/transactions?type=expense&tab=general&month=${selectedMonth}`)}
              >
                明細 ➔
              </button>
            </div>

            <TransactionList
              data={recentGeneral.data?.items}
              loading={recentGeneral.isLoading}
              accounts={accountsList}
              invalidate={invalidateAll}
            />
          </div>

          {/* Right Column: 💳 信用卡支出 (可切換信用卡) */}
          <div className="ff3-card" style={{ margin: 0 }}>
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
                  <span>💳</span> 信用卡支出 ({selectedMonth})
                </h3>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  請款入帳、帳單刷卡明細
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>全卡加總開銷 (含排程)</div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: allCardsTotalExposureMinor > 0n ? "#ef4444" : "var(--fg)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {fmt(-allCardsTotalExposureMinor, creditCurrency)}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 12px", fontWeight: 600 }}
                  onClick={() => setCreditModalOpen(true)}
                >
                  ➕ 手動記帳
                </button>

                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    const accParam = selectedCreditCardId || creditAccounts.map((c) => c.id).join(",");
                    router.push(`/transactions?type=expense&account=${accParam}&month=${selectedMonth}`);
                  }}
                >
                  明細 ➔
                </button>
              </div>
            </div>

            {/* Realistic Credit Card Selector Buttons & Total Exposure Line */}
            <CreditCardSelector
              cards={creditAccounts}
              selectedCardId={selectedCreditCardId}
              onSelectCard={setSelectedCreditCardId}
              actualExpenseMinor={actualCreditExpenseMinor}
              upcomingExpenseMinor={upcomingCreditExpenseMinor}
              totalExposureMinor={totalCreditExposureMinor}
              currency={creditCurrency}
              cardTotalsMap={cardTotalsMap}
            />

            <CreditTransactionGroupedList
              data={recentCredit.data?.items}
              loading={recentCredit.isLoading}
              categories={categories.data}
              onManualAdd={() => setCreditModalOpen(true)}
              onImportCsv={() => router.push("/transactions")}
            />
          </div>
        </div>

        {/* Credit Transaction Manual Add Modal */}
        <CreditTransactionModal
          open={creditModalOpen}
          onClose={() => setCreditModalOpen(false)}
          defaultAccountId={selectedCreditCardId}
          creditAccounts={creditAccounts}
          month={selectedMonth}
          onSuccess={async () => {
            await Promise.all([
              utils.transactions.list.invalidate(),
              utils.transactions.monthlyBreakdown.invalidate(),
              utils.accounts.listWithBalances.invalidate(),
              utils.netWorth.summary.invalidate(),
            ]);
          }}
        />

        {/* Category Transactions Popup Modal */}
        <CategoryTransactionsModal
          isOpen={Boolean(selectedCatModal)}
          onClose={() => setSelectedCatModal(null)}
          title={selectedCatModal?.title || "分類明細"}
          month={selectedMonth}
          categoryId={selectedCatModal?.categoryId}
          categoryIds={selectedCatModal?.categoryIds}
          totalAmountMinor={selectedCatModal?.totalAmountMinor}
          currency={monthCats.data?.baseCurrency || "TWD"}
          onChanged={invalidateAll}
        />
      </div>
    </>
  );
}
