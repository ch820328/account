"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/labels";
import { niceToast } from "@/lib/confirm";
import { BillEntryTab } from "./bill-cycle/BillEntryTab";
import { BillHistoryTab } from "./bill-cycle/BillHistoryTab";
import { BillItem } from "./bill-cycle/BillTypes";

export interface BudgetMinimalItem {
  id: string;
  name: string;
  icon?: string | null;
  annualAmountMinor: bigint | string;
  allocationType: "fixed_months" | "rolling";
  accountId?: string | null;
  accountName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
}

interface BillCycleModalProps {
  year: number;
  budgetItems: BudgetMinimalItem[];
  initialBudgetId?: string;
  onClose: () => void;
  onUpdated?: () => void;
}

export function BillCycleModal({
  year,
  budgetItems,
  initialBudgetId,
  onClose,
  onUpdated,
}: BillCycleModalProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();

  // Active budget item selected
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    initialBudgetId || budgetItems[0]?.id || ""
  );

  // Tab mode: "keyin" (create or edit) vs "history" (view bills list)
  const [activeTab, setActiveTab] = useState<"keyin" | "history">("keyin");

  // Editing bill state
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  // Form fields
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current item's bills and summary
  const itemBillsQuery = trpc.annualBudgets.getItemBills.useQuery(
    { budgetId: selectedBudgetId, year },
    { enabled: Boolean(selectedBudgetId) }
  );

  const activeBudget = useMemo(() => {
    return budgetItems.find((b) => b.id === selectedBudgetId);
  }, [budgetItems, selectedBudgetId]);

  // Find the latest bill's end date for this item to auto-continue billing cycle
  const latestEndDate = useMemo(() => {
    if (!itemBillsQuery.data?.bills || itemBillsQuery.data.bills.length === 0) return null;
    const billsWithEndDate = itemBillsQuery.data.bills.filter((b) => Boolean(b.endDate));
    if (billsWithEndDate.length === 0) return null;

    const sorted = [...billsWithEndDate].sort((a, b) => {
      return (b.endDate || "").localeCompare(a.endDate || "");
    });
    return sorted[0]?.endDate || null;
  }, [itemBillsQuery.data?.bills]);

  // Calculate the next day after latestEndDate as the starting point
  const nextStartDate = useMemo(() => {
    if (!latestEndDate) return null;
    const [y, m, d] = latestEndDate.split("-").map(Number);
    if (!y || !m || !d) return null;
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    return nextDate.toISOString().split("T")[0] || null;
  }, [latestEndDate]);

  // When changing selected budget item, reset or populate defaults
  useEffect(() => {
    if (activeBudget && !editingBillId) {
      if (activeBudget.accountId) {
        setAccountId(activeBudget.accountId);
      } else if (accountsQuery.data && accountsQuery.data.length > 0) {
        setAccountId(accountsQuery.data[0]!.id);
      }
    }
  }, [activeBudget, accountsQuery.data, editingBillId]);

  // Auto-fill nextStartDate into startDate when switching items or bills load
  useEffect(() => {
    if (!editingBillId) {
      if (nextStartDate) {
        setStartDate(nextStartDate);
      }
    }
  }, [nextStartDate, editingBillId, selectedBudgetId]);

  function addMonthsToEndDate(baseStart: string, monthsToAdd: number) {
    if (!baseStart) return;
    const [y, m, d] = baseStart.split("-").map(Number);
    if (!y || !m || !d) return;
    const target = new Date(Date.UTC(y, m - 1 + monthsToAdd, d - 1));
    setEndDate(target.toISOString().split("T")[0]!);
  }

  // Client-side real-time calculation of daily proration
  const liveProration = useMemo(() => {
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0 || !startDate || !endDate) return null;

    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) return null;

    const sDate = new Date(Date.UTC(sy, sm - 1, sd));
    const eDate = new Date(Date.UTC(ey, em - 1, ed));
    if (eDate.getTime() < sDate.getTime()) return null;

    const ONE_DAY_MS = 86400 * 1000;
    const totalDays = Math.round((eDate.getTime() - sDate.getTime()) / ONE_DAY_MS) + 1;
    if (totalDays <= 0) return null;

    const dailyRate = numAmt / totalDays;
    const monthlyList: { month: number; days: number; amount: number }[] = [];
    let allocatedTotal = 0;
    let maxDaysMonth = 1;
    let maxDays = 0;

    for (let m = 1; m <= 12; m++) {
      const monthStart = new Date(Date.UTC(year, m - 1, 1));
      const monthEnd = new Date(Date.UTC(year, m, 0));

      const overlapStart = Math.max(sDate.getTime(), monthStart.getTime());
      const overlapEnd = Math.min(eDate.getTime(), monthEnd.getTime());

      if (overlapEnd >= overlapStart) {
        const days = Math.round((overlapEnd - overlapStart) / ONE_DAY_MS) + 1;
        const mAmount = Math.ceil(numAmt * (days / totalDays));
        monthlyList.push({ month: m, days, amount: mAmount });
        allocatedTotal += mAmount;
        if (days > maxDays) {
          maxDays = days;
          maxDaysMonth = m;
        }
      }
    }

    // Distribute remainder so sum equals numAmt exactly
    const diff = Math.round(numAmt - allocatedTotal);
    if (diff !== 0) {
      const target = monthlyList.find((item) => item.month === maxDaysMonth);
      if (target) target.amount += diff;
    }

    return {
      totalDays,
      dailyRate: dailyRate.toFixed(1),
      monthlyList,
    };
  }, [amount, startDate, endDate, year]);

  // Mutations
  const saveBillMutation = trpc.annualBudgets.saveBill.useMutation({
    onSuccess: async (createdTx) => {
      // If there is an attachment to upload
      if (attachmentFile && createdTx?.id) {
        try {
          const formData = new FormData();
          formData.append("file", attachmentFile);
          formData.append("transactionId", createdTx.id);
          await fetch("/api/attachments", {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          console.warn("Attachment upload error:", err);
        }
      }

      await Promise.all([
        utils.annualBudgets.getItemBills.invalidate({ budgetId: selectedBudgetId, year }),
        utils.annualBudgets.list.invalidate({ year }),
        utils.transactions.list.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
      ]);

      niceToast(editingBillId ? "帳單修改完成" : "帳單已成功登記並均攤！", "success");
      handleResetForm();
      setActiveTab("history");
      onUpdated?.();
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  const deleteBillMutation = trpc.annualBudgets.deleteBill.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.annualBudgets.getItemBills.invalidate({ budgetId: selectedBudgetId, year }),
        utils.annualBudgets.list.invalidate({ year }),
        utils.transactions.list.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
      ]);
      niceToast("帳單已刪除", "info");
      onUpdated?.();
    },
    onError: (err) => {
      niceToast(`刪除失敗：${err.message}`, "error");
    },
  });

  function handleResetForm() {
    setEditingBillId(null);
    setAmount("");
    setStartDate(nextStartDate || "");
    setEndDate("");
    setPaidAt(todayIso());
    setNote("");
    setAttachmentFile(null);
    setFormError(null);
  }

  function handleStartEdit(bill: BillItem) {
    setEditingBillId(bill.id);
    setAmount(String(Number(bill.amountMinor) / 100));
    setStartDate(bill.startDate || "");
    setEndDate(bill.endDate || "");
    setPaidAt(bill.paidDate || todayIso());
    setAccountId(bill.accountId || "");
    setNote(bill.note || "");
    setAttachmentFile(null);
    setFormError(null);
    setActiveTab("keyin");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      setFormError("請輸入正確的帳單金額");
      return;
    }

    if (!startDate || !endDate) {
      setFormError("請輸入完整的計費起訖日期");
      return;
    }

    if (startDate > endDate) {
      setFormError("計費起始日不能晚於結束日");
      return;
    }

    if (!paidAt) {
      setFormError("請選擇繳款/扣款日期");
      return;
    }

    if (!accountId) {
      setFormError("請選擇扣款帳戶");
      return;
    }

    saveBillMutation.mutate({
      id: editingBillId || undefined,
      budgetId: selectedBudgetId,
      amount: amount.trim(),
      startDate,
      endDate,
      paidAt,
      accountId,
      note: note.trim() || undefined,
    });
  }

  // Quick bi-monthly cycle helpers
  function setQuickCycle(m1: number, m2: number) {
    const sStr = `${year}-${String(m1).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, m2, 0)).getUTCDate();
    const eStr = `${year}-${String(m2).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setStartDate(sStr);
    setEndDate(eStr);
  }

  const bills = (itemBillsQuery.data?.bills ?? []) as BillItem[];
  const summary = itemBillsQuery.data?.summary;

  const annualVal = activeBudget ? Number(activeBudget.annualAmountMinor) / 100 : 0;
  const monthlyVal = Math.round(annualVal / 12);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(640px, 50vw, 1100px)",
          maxWidth: "95vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#0d111a",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 14,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🧾</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f8fafc" }}>
                週期性帳單管理與跨月平攤
              </h3>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                輸入帳單計費區間（如水電/瓦斯），系統自動精準按日平攤各月份並對比年度預算
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            style={{ fontSize: 18, padding: "4px 10px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* ITEM SELECTOR BAR */}
        <div
          style={{
            padding: "12px 20px",
            background: "rgba(0, 0, 0, 0.3)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "#cbd5e1" }}>
            選擇預算項目：
          </label>
          <select
            value={selectedBudgetId}
            onChange={(e) => {
              setSelectedBudgetId(e.target.value);
              handleResetForm();
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "#1e293b",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#f8fafc",
              fontSize: 13,
              fontWeight: 600,
              minWidth: 180,
            }}
          >
            {budgetItems.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon || "📌"} {b.name} (${(Number(b.annualAmountMinor) / 100).toLocaleString()}/年)
              </option>
            ))}
          </select>

          {/* Quick Item Pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
            {budgetItems.slice(0, 6).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSelectedBudgetId(b.id);
                  handleResetForm();
                }}
                style={{
                  padding: "4px 8px",
                  fontSize: 11.5,
                  borderRadius: 6,
                  border:
                    b.id === selectedBudgetId
                      ? "1px solid #6366f1"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                  background:
                    b.id === selectedBudgetId
                      ? "rgba(99, 102, 241, 0.2)"
                      : "rgba(255, 255, 255, 0.03)",
                  color: b.id === selectedBudgetId ? "#a5b4fc" : "#94a3b8",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontWeight: b.id === selectedBudgetId ? 700 : 500,
                }}
              >
                {b.icon || "📌"} {b.name}
              </button>
            ))}
          </div>
        </div>

        {/* PROGRESS & BUDGET METRIC CARD */}
        {activeBudget && (
          <div
            style={{
              margin: "12px 20px 0 20px",
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>年度總預算</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", marginTop: 2 }}>
                ${annualVal.toLocaleString()}
              </div>
              <div style={{ fontSize: 10.5, color: "#a5b4fc" }}>
                ${monthlyVal.toLocaleString()} / 月均
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>帳單覆蓋進度</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#38bdf8", marginTop: 2 }}>
                {summary?.progressRatioText || "—"}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                共 {bills.length} 筆已登錄帳單
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>進度基準預算</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", marginTop: 2 }}>
                ${summary ? (Number(summary.progressBudgetMinor) / 100).toLocaleString() : 0}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>按涵蓋期別比例折算</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>實際已繳總額</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa", marginTop: 2 }}>
                ${summary ? (Number(summary.totalSpentMinor) / 100).toLocaleString() : 0}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>全期扣款總計</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>執行結果對比</div>
              {summary && Number(summary.totalSpentMinor) > 0 ? (
                summary.isOverBudget ? (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f87171", marginTop: 2 }}>
                      +${(Number(summary.varianceMinor) / 100).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#f87171", fontWeight: 600 }}>
                      ⚠️ 累計超支
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#34d399", marginTop: 2 }}>
                      -${Math.abs(Number(summary.varianceMinor) / 100).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#34d399", fontWeight: 600 }}>
                      🟢 累計省下
                    </div>
                  </div>
                )
              ) : (
                <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>— 尚無記錄</div>
              )}
            </div>
          </div>
        )}

        {/* TAB CONTROLS */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "0 20px",
            marginTop: 10,
            gap: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("keyin")}
            style={{
              padding: "10px 4px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "keyin" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "keyin" ? "#a5b4fc" : "var(--muted)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {editingBillId ? "✏️ 編輯帳單資料" : "➕ 登錄新帳單"}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            style={{
              padding: "10px 4px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "history" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "history" ? "#a5b4fc" : "var(--muted)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📜 歷史帳單明細</span>
            {bills.length > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: activeTab === "history" ? "#6366f1" : "rgba(255, 255, 255, 0.1)",
                  color: "#fff",
                }}
              >
                {bills.length}
              </span>
            )}
          </button>
        </div>

        {/* MODAL BODY */}
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {activeTab === "keyin" ? (
            <BillEntryTab
              editingBillId={editingBillId}
              amount={amount}
              setAmount={setAmount}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              paidAt={paidAt}
              setPaidAt={setPaidAt}
              accountId={accountId}
              setAccountId={setAccountId}
              note={note}
              setNote={setNote}
              attachmentFile={attachmentFile}
              setAttachmentFile={setAttachmentFile}
              formError={formError}
              nextStartDate={nextStartDate}
              latestEndDate={latestEndDate}
              liveProration={liveProration}
              accounts={accountsQuery.data ?? []}
              isPending={saveBillMutation.isPending}
              amountRef={amountRef}
              fileInputRef={fileInputRef}
              onResetForm={handleResetForm}
              onSubmit={handleSubmit}
              onSetQuickCycle={setQuickCycle}
              onAddMonthsToEndDate={addMonthsToEndDate}
            />
          ) : (
            <BillHistoryTab
              isLoading={itemBillsQuery.isLoading}
              bills={bills}
              onStartEdit={handleStartEdit}
              onDelete={(id) => deleteBillMutation.mutate({ id })}
              onNewBill={() => {
                handleResetForm();
                setActiveTab("keyin");
              }}
            />
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            💡 帳單儲存後，主預算矩陣會自動即時重新計算並均攤至對應月份
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
