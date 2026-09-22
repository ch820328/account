import React, { useState } from "react";
import type { BudgetItem } from "./types";
import { parseMonthsList } from "./MonthSelector";
import { BillCycleModal } from "./BillCycleModal";
import { trpc } from "@/lib/trpc";
import { MatrixHeader, MatrixTableHead } from "./matrix/MatrixHeader";
import { MatrixFixedSection } from "./matrix/MatrixFixedSection";
import { MatrixRollingSection } from "./matrix/MatrixRollingSection";
import { MatrixFooterTotals } from "./matrix/MatrixFooterTotals";
import { MatrixSettleModal, type SettleModalItem } from "./matrix/MatrixSettleModal";
import type { MasterBudgetMatrixProps } from "./matrix/MatrixTypes";

export { getAccountIcon } from "./matrix/MatrixTypes";

export function MasterBudgetMatrix({
  targetYear,
  currentMonthIdx,
  budgetItems,
  onStartEdit,
  onStartAdd,
  onSettled,
  onDelete,
}: MasterBudgetMatrixProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.listWithBalances.useQuery();
  const accounts = accountsQuery.data || [];

  const [settleModalItem, setSettleModalItem] = useState<SettleModalItem | null>(null);
  const [billModalItem, setBillModalItem] = useState<BudgetItem | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);

  const confirmMutation = trpc.annualBudgets.confirmSettlement.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.list.invalidate(),
        utils.annualBudgets.pendingMonthlyItems.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.transactions.monthCategories.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
      ]);
      setSettleModalItem(null);
      if (onSettled) onSettled();
    },
    onError: (err) => {
      alert(`扣款失敗：${err.message}`);
    },
  });

  const setPaidMutation = trpc.transactions.setPaid.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.list.invalidate(),
        utils.transactions.list.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
      ]);
      if (onSettled) onSettled();
    },
    onError: (err) => {
      alert(`更新付款狀態失敗：${err.message}`);
    },
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const updateSort = trpc.annualBudgets.updateSort.useMutation({
    onMutate: async (newOrder) => {
      await utils.annualBudgets.list.cancel({ year: targetYear });
      const prev = utils.annualBudgets.list.getData({ year: targetYear });
      if (prev) {
        const orderMap = new Map(newOrder.map((o) => [o.id, o.sortOrder]));
        const sortedItems = [...prev.items].sort((a, b) => {
          const orderA = orderMap.get(a.id) ?? a.sortOrder ?? 0;
          const orderB = orderMap.get(b.id) ?? b.sortOrder ?? 0;
          return orderA - orderB;
        });
        utils.annualBudgets.list.setData({ year: targetYear }, {
          ...prev,
          items: sortedItems,
        });
      }
      return { prev };
    },
    onError: (_err, _newOrder, context) => {
      if (context?.prev) {
        utils.annualBudgets.list.setData({ year: targetYear }, context.prev);
      }
    },
    onSettled: () => {
      utils.annualBudgets.list.invalidate({ year: targetYear });
    },
  });

  // Separate into Fixed Expenses vs Rolling/Living Budgets
  const fixedItems = budgetItems.filter((b) => b.allocationType === "fixed_months");
  const rollingItems = budgetItems.filter((b) => b.allocationType !== "fixed_months");

  function handleMove(id: string, allocationType: "fixed_months" | "rolling", direction: "up" | "down") {
    const isFixed = allocationType === "fixed_months";
    const currentGroup = isFixed ? [...fixedItems] : [...rollingItems];
    const otherGroup = isFixed ? [...rollingItems] : [...fixedItems];

    const idx = currentGroup.findIndex((item) => item.id === id);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === currentGroup.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const temp = currentGroup[idx]!;
    currentGroup[idx] = currentGroup[targetIdx]!;
    currentGroup[targetIdx] = temp;

    const newFixed = isFixed ? currentGroup : otherGroup;
    const newRolling = isFixed ? otherGroup : currentGroup;

    const newOrder = [...newFixed, ...newRolling].map((item, index) => ({
      id: item.id,
      sortOrder: index,
    }));

    updateSort.mutate(newOrder);
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (draggedId && draggedId !== targetId && dragOverId !== targetId) {
      setDragOverId(targetId);
    }
  }

  function handleDragLeave(e: React.DragEvent, targetId: string) {
    if (dragOverId === targetId) {
      setDragOverId(null);
    }
  }

  function handleDrop(e: React.DragEvent, dropTargetId: string, allocationType: "fixed_months" | "rolling") {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = draggedId || e.dataTransfer.getData("text/plain");
    setDraggedId(null);

    if (!sourceId || sourceId === dropTargetId) return;

    const isFixed = allocationType === "fixed_months";
    const currentGroup = isFixed ? [...fixedItems] : [...rollingItems];
    const otherGroup = isFixed ? [...rollingItems] : [...fixedItems];

    const fromIdx = currentGroup.findIndex((item) => item.id === sourceId);
    const toIdx = currentGroup.findIndex((item) => item.id === dropTargetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [movedItem] = currentGroup.splice(fromIdx, 1);
    if (!movedItem) return;
    currentGroup.splice(toIdx, 0, movedItem);

    const newFixed = isFixed ? currentGroup : otherGroup;
    const newRolling = isFixed ? otherGroup : currentGroup;

    const newOrder = [...newFixed, ...newRolling].map((item, index) => ({
      id: item.id,
      sortOrder: index,
    }));

    updateSort.mutate(newOrder);
  }

  function handleAutoSort(allocationType: "fixed_months" | "rolling", sortBy: "months" | "amount" | "name") {
    const isFixed = allocationType === "fixed_months";
    const currentGroup = isFixed ? [...fixedItems] : [...rollingItems];
    const otherGroup = isFixed ? [...rollingItems] : [...fixedItems];

    currentGroup.sort((a, b) => {
      if (sortBy === "months") {
        const aMonths = parseMonthsList(a.targetMonths || "");
        const bMonths = parseMonthsList(b.targetMonths || "");
        const aFirst = aMonths[0] ?? 99;
        const bFirst = bMonths[0] ?? 99;
        if (aFirst !== bFirst) return aFirst - bFirst;
        return aMonths.length - bMonths.length;
      }
      if (sortBy === "amount") {
        return Number(b.annualAmountMinor - a.annualAmountMinor);
      }
      return a.name.localeCompare(b.name, "zh-Hant");
    });

    const newFixed = isFixed ? currentGroup : otherGroup;
    const newRolling = isFixed ? otherGroup : currentGroup;

    const newOrder = [...newFixed, ...newRolling].map((item, index) => ({
      id: item.id,
      sortOrder: index,
    }));

    updateSort.mutate(newOrder);
  }

  // Calculate Subtotals and Monthly Totals
  const monthlyFixedTotals: Record<number, number> = {};
  const monthlyRollingTotals: Record<number, number> = {};
  const monthlyGrandTotals: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthlyFixedTotals[m] = 0;
    monthlyRollingTotals[m] = 0;
    monthlyGrandTotals[m] = 0;
  }

  let yearFixedSum = 0;
  let yearFixedSpentSum = 0;
  let yearFixedBudgetToDateSum = 0;

  let yearRollingSum = 0;
  let yearRollingSpentSum = 0;
  let yearRollingBudgetToDateSum = 0;

  for (const b of fixedItems) {
    const annual = Number(b.annualAmountMinor) / 100;
    yearFixedSum += annual;
    const spentVal = Math.ceil(Number(b.spentAmountMinor) / 100);
    yearFixedSpentSum += spentVal;

    const mList = parseMonthsList(b.targetMonths || "");
    const perPeriod = mList.length > 0 ? Math.ceil(annual / mList.length) : annual;

    for (const m of b.months) {
      const isTarget = mList.includes(m.month);
      const actualVal = Math.ceil(Number(m.actualMinor) / 100);
      const isPast = m.month < currentMonthIdx;

      if (isPast) {
        if (actualVal > 0) {
          yearFixedBudgetToDateSum += perPeriod;
          monthlyFixedTotals[m.month] = (monthlyFixedTotals[m.month] ?? 0) + actualVal;
          monthlyGrandTotals[m.month] = (monthlyGrandTotals[m.month] ?? 0) + actualVal;
        }
      } else {
        if (m.month === currentMonthIdx && actualVal > 0) {
          yearFixedBudgetToDateSum += perPeriod;
        }
        const displayVal = actualVal > 0 ? actualVal : (isTarget ? perPeriod : 0);
        monthlyFixedTotals[m.month] = (monthlyFixedTotals[m.month] ?? 0) + displayVal;
        monthlyGrandTotals[m.month] = (monthlyGrandTotals[m.month] ?? 0) + displayVal;
      }
    }
  }

  for (const b of rollingItems) {
    const annual = Number(b.annualAmountMinor) / 100;
    yearRollingSum += annual;
    const spentVal = Math.ceil(Number(b.spentAmountMinor) / 100);
    yearRollingSpentSum += spentVal;

    const baseMonthly = Math.ceil(annual / 12);

    for (const m of b.months) {
      const actualVal = Math.ceil(Number(m.actualMinor) / 100);
      const effectiveVal = Math.ceil(Number(m.effectiveMinor) / 100);
      const isPast = m.month < currentMonthIdx;

      if (isPast) {
        if (actualVal > 0) {
          yearRollingBudgetToDateSum += baseMonthly;
          monthlyRollingTotals[m.month] = (monthlyRollingTotals[m.month] ?? 0) + actualVal;
          monthlyGrandTotals[m.month] = (monthlyGrandTotals[m.month] ?? 0) + actualVal;
        }
      } else {
        if (m.month === currentMonthIdx && actualVal > 0) {
          yearRollingBudgetToDateSum += baseMonthly;
        }
        const displayVal = actualVal > 0 ? actualVal : (effectiveVal > 0 ? effectiveVal : baseMonthly);
        monthlyRollingTotals[m.month] = (monthlyRollingTotals[m.month] ?? 0) + displayVal;
        monthlyGrandTotals[m.month] = (monthlyGrandTotals[m.month] ?? 0) + displayVal;
      }
    }
  }

  const yearGrandSum = yearFixedSum + yearRollingSum;
  const yearGrandSpentSum = yearFixedSpentSum + yearRollingSpentSum;
  const yearGrandBudgetToDateSum = yearFixedBudgetToDateSum + yearRollingBudgetToDateSum;

  return (
    <div
      className="ff3-card"
      style={{
        padding: "20px 24px",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      <MatrixHeader
        targetYear={targetYear}
        currentMonthIdx={currentMonthIdx}
        fixedCount={fixedItems.length}
        rollingCount={rollingItems.length}
        onStartAdd={onStartAdd}
      />

      {budgetItems.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)", marginBottom: 6 }}>
            尚未建立 {targetYear} 年度的預算或固定開銷項目
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            立即新增季繳管理費、保險、稅金或日常生活預算，體驗 12 個月精準排程！
          </div>
          {onStartAdd && (
            <button type="button" className="btn" onClick={onStartAdd}>
              ＋ 開始設定年度預算
            </button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            <MatrixTableHead currentMonthIdx={currentMonthIdx} />

            <tbody>
              <MatrixFixedSection
                fixedItems={fixedItems}
                currentMonthIdx={currentMonthIdx}
                draggedId={draggedId}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onAutoSort={handleAutoSort}
                onMove={handleMove}
                onStartEdit={onStartEdit}
                onDelete={onDelete}
                onOpenSettleModal={(item) => setSettleModalItem(item)}
                onTogglePaid={(transactionId, willBePaid) =>
                  setPaidMutation.mutate({ id: transactionId, isPaid: willBePaid })
                }
              />

              <MatrixRollingSection
                rollingItems={rollingItems}
                budgetItems={budgetItems}
                currentMonthIdx={currentMonthIdx}
                draggedId={draggedId}
                dragOverId={dragOverId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onAutoSort={handleAutoSort}
                onMove={handleMove}
                onStartEdit={onStartEdit}
                onDelete={onDelete}
                onOpenBillModal={(item) => {
                  setBillModalItem(item);
                  setIsBillModalOpen(true);
                }}
                onTogglePaid={(transactionId, willBePaid) =>
                  setPaidMutation.mutate({ id: transactionId, isPaid: willBePaid })
                }
              />
            </tbody>

            <MatrixFooterTotals
              currentMonthIdx={currentMonthIdx}
              yearFixedSum={yearFixedSum}
              yearFixedSpentSum={yearFixedSpentSum}
              yearFixedBudgetToDateSum={yearFixedBudgetToDateSum}
              monthlyFixedTotals={monthlyFixedTotals}
              yearRollingSum={yearRollingSum}
              yearRollingSpentSum={yearRollingSpentSum}
              yearRollingBudgetToDateSum={yearRollingBudgetToDateSum}
              monthlyRollingTotals={monthlyRollingTotals}
              yearGrandSum={yearGrandSum}
              yearGrandSpentSum={yearGrandSpentSum}
              yearGrandBudgetToDateSum={yearGrandBudgetToDateSum}
              monthlyGrandTotals={monthlyGrandTotals}
              hasEditAction={!!onStartEdit}
            />
          </table>
        </div>
      )}

      {/* Legend & Explanation */}
      <div
        style={{
          marginTop: 18,
          fontSize: 12,
          color: "var(--muted)",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#34d399", fontWeight: 700 }}>✓ $已付清</span>：
          <span>銀行帳戶已扣款或卡費已付清（點擊可切換狀態）</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#fb923c", fontWeight: 700 }}>💳 $待扣繳</span>：
          <span>已出帳待繳（已刷卡入帳單，但銀行尚未扣款，點擊可標記已繳清）</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#fbbf24", fontWeight: 700 }}>$未出帳</span>：
          <span>預算規劃中（尚未刷卡或扣款，點擊可快速核對入帳）</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#34d399", fontWeight: 700 }}>🟢 至今差額</span>：<span style={{ color: "#34d399" }}>(省) 綠字</span> 為累計節省預算，<span style={{ color: "#f87171" }}>(超) 紅字</span> 為累計超支金額
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#a5b4fc", fontWeight: 700 }}>★ 本月</span>：當前進行中之基準月份
        </span>
      </div>

      {/* 1-Click Settlement Modal */}
      {settleModalItem && (
        <MatrixSettleModal
          targetYear={targetYear}
          settleModalItem={settleModalItem}
          accounts={accounts}
          isPending={confirmMutation.isPending}
          onClose={() => setSettleModalItem(null)}
          onConfirm={(item) => confirmMutation.mutate(item)}
          onChange={(updated) => setSettleModalItem(updated)}
        />
      )}

      {/* Bill Cycle & Proration Management Modal */}
      {isBillModalOpen && (
        <BillCycleModal
          year={targetYear}
          budgetItems={budgetItems}
          initialBudgetId={billModalItem?.id}
          onClose={() => {
            setIsBillModalOpen(false);
            setBillModalItem(null);
          }}
          onUpdated={() => {
            utils.annualBudgets.list.invalidate({ year: targetYear });
          }}
        />
      )}
    </div>
  );
}
