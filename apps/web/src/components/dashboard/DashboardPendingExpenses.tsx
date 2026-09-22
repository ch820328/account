"use client";

import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { AccountOptions } from "@/components/AccountOptions";
import { AmountInput } from "@/components/AmountInput";
import { todayIso } from "@/lib/labels";

interface DashboardPendingExpensesProps {
  currentMonth: string; // e.g. "2026-09"
  onSettled?: () => void;
}

export function DashboardPendingExpenses({
  currentMonth,
  onSettled,
}: DashboardPendingExpensesProps) {
  const [yearStr, monthStr] = currentMonth.split("-");
  const targetYear = Number(yearStr) || new Date().getFullYear();
  const targetMonth = Number(monthStr) || new Date().getMonth() + 1;

  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.listWithBalances.useQuery();
  const pendingQuery = trpc.annualBudgets.pendingMonthlyItems.useQuery(
    { year: targetYear, month: targetMonth },
    { staleTime: 10_000 }
  );

  const confirmMutation = trpc.annualBudgets.confirmSettlement.useMutation({
    onSuccess: async () => {
      await Promise.all([
        pendingQuery.refetch(),
        utils.transactions.list.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.transactions.monthCategories.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.annualBudgets.list.invalidate(),
      ]);
      setEditingItem(null);
      if (onSettled) onSettled();
    },
    onError: (err) => {
      alert(`扣款失敗：${err.message}`);
    },
  });

  // State for manual amount / account confirmation popup
  const [editingItem, setEditingItem] = useState<{
    budgetId: string;
    name: string;
    icon?: string | null;
    estimatedAmount: number;
    amount: string;
    accountId: string;
    accountName?: string | null;
    accountCurrency?: string;
    occurredAt: string;
    note: string;
  } | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingItem) {
      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 100);
    }
  }, [editingItem?.budgetId]);

  const pendingItems = pendingQuery.data?.items || [];
  const accounts = accountsQuery.data || [];

  if (pendingQuery.isLoading) return null;
  if (pendingItems.length === 0) return null;

  // Always open confirmation popup to let user review and confirm amount & account!
  const handleOpenConfirm = (item: (typeof pendingItems)[0]) => {
    setEditingItem({
      budgetId: item.budgetId,
      name: item.name,
      icon: item.icon,
      estimatedAmount: item.estimatedAmount,
      amount: String(item.estimatedAmount),
      accountId: item.accountId || accounts[0]?.id || "",
      accountName: item.accountName || accounts[0]?.name || "",
      accountCurrency: item.accountCurrency || accounts[0]?.currency || "TWD",
      occurredAt: todayIso(),
      note: item.name,
    });
  };

  return (
    <div
      className="ff3-card"
      style={{
        marginBottom: 20,
        background: "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(30, 41, 59, 0.5) 100%)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* Card Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
          borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fbbf24" }}>
            本月待確認固定支出 ({pendingItems.length} 筆待入帳)
          </h3>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 12,
              background: "rgba(245, 158, 11, 0.2)",
              color: "#fbbf24",
              fontWeight: 600,
            }}
          >
            {targetMonth}月份預排
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          真實轉帳或扣款後，點擊「核對入帳」彈窗確認金額與帳戶，即可安全扣款！
        </div>
      </div>

      {/* List of Pending Items (Responsive Grid: 3-4 items per row, button-like appearance) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 10,
        }}
      >
        {pendingItems.map((item) => (
          <button
            key={item.budgetId}
            type="button"
            disabled={confirmMutation.isPending}
            onClick={() => handleOpenConfirm(item)}
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "11px 13px",
              borderRadius: 10,
              background: "linear-gradient(145deg, rgba(26, 34, 52, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              cursor: "pointer",
              textAlign: "left",
              gap: 8,
              transition: "all 0.18s ease-in-out",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.6)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(245, 158, 11, 0.18), 0 2px 8px rgba(0, 0, 0, 0.4)";
              e.currentTarget.style.background = "linear-gradient(145deg, rgba(35, 45, 70, 0.9) 0%, rgba(20, 30, 55, 0.98) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.25)";
              e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.25)";
              e.currentTarget.style.background = "linear-gradient(145deg, rgba(26, 34, 52, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)";
            }}
            title="點擊開啟核對彈窗，確認實付金額與帳戶後扣款入帳"
          >
            {/* Top row: Icon + Name + Amount */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon || "📌"}</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13.5,
                    color: "#f8fafc",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.name}
                </span>
              </div>
              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 800,
                  color: "#fbbf24",
                  fontFamily: "var(--font-mono, monospace)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                NT$ {item.estimatedAmount.toLocaleString()}
              </div>
            </div>

            {/* Middle row: Category & Account Hint */}
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                width: "100%",
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.parentCategoryName ? (
                  <span style={{ color: "#fbbf24", opacity: 0.9 }}>
                    🏷️ {item.parentCategoryName} · {item.categoryName}
                  </span>
                ) : (
                  <span>🏷️ {item.categoryName || "未分類"}</span>
                )}
              </div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255, 255, 255, 0.6)" }}>
                {item.accountName ? (
                  <span>🏦 預設：{item.accountName}</span>
                ) : (
                  <span style={{ color: "#f87171" }}>⚠️ 未設帳戶</span>
                )}
              </div>
            </div>

            {/* Bottom: Action trigger button badge */}
            <div
              style={{
                marginTop: 2,
                paddingTop: 6,
                borderTop: "1px dashed rgba(245, 158, 11, 0.2)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 10, color: "var(--muted)" }}>預估額度</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 6,
                  background: "linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.4) 100%)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                💳 核對入帳
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Confirmation & Amount Adjustment Modal Dialog */}
      {editingItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setEditingItem(null)}
        >
          <div
            className="ff3-card"
            style={{
              width: "clamp(560px, 50vw, 850px)",
              maxWidth: "95vw",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "linear-gradient(180deg, #182234 0%, #0f172a 100%)",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7), 0 0 25px rgba(245, 158, 11, 0.15)",
              borderRadius: 14,
              padding: "22px 26px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
                borderBottom: "1px solid var(--border)",
                paddingBottom: 12,
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 17, display: "flex", alignItems: "center", gap: 8, color: "var(--fg)" }}>
                  <span style={{ fontSize: 20 }}>{editingItem.icon || "📌"}</span>
                  <span>核對並確認扣款：{editingItem.name}</span>
                </h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
                  請確認實際轉帳/刷卡金額與扣款帳戶，送出後將建立支出交易並扣減帳戶餘額。
                </p>
              </div>
              <button
                type="button"
                className="btn ghost"
                style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
                onClick={() => setEditingItem(null)}
              >
                ✕
              </button>
            </div>

            {/* Estimated vs Actual Comparison Banner */}
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 8,
                marginBottom: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>項目預估金額</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>
                  NT$ {editingItem.estimatedAmount.toLocaleString()}
                </div>
              </div>

              {Number(editingItem.amount) !== editingItem.estimatedAmount && !isNaN(Number(editingItem.amount)) && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>與預估差額</div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: Number(editingItem.amount) > editingItem.estimatedAmount ? "#ef4444" : "#10b981",
                    }}
                  >
                    {Number(editingItem.amount) > editingItem.estimatedAmount ? "+" : ""}
                    NT$ {(Number(editingItem.amount) - editingItem.estimatedAmount).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                confirmMutation.mutate({
                  budgetId: editingItem.budgetId,
                  year: targetYear,
                  month: targetMonth,
                  amount: editingItem.amount,
                  accountId: editingItem.accountId,
                  occurredAt: editingItem.occurredAt ? `${editingItem.occurredAt}T12:00:00` : undefined,
                  note: editingItem.note.trim() || undefined,
                });
              }}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              {/* Amount Input */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
                    實付金額 (NT$) <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  {Number(editingItem.amount) !== editingItem.estimatedAmount && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ fontSize: 11, padding: "2px 8px", color: "var(--primary)" }}
                      onClick={() =>
                        setEditingItem({
                          ...editingItem,
                          amount: String(editingItem.estimatedAmount),
                        })
                      }
                    >
                      ↺ 還原為預估金額
                    </button>
                  )}
                </div>

                <AmountInput
                  ref={amountInputRef}
                  value={editingItem.amount}
                  onChange={(val) => setEditingItem({ ...editingItem, amount: val })}
                  placeholder="0"
                  className="input"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    letterSpacing: "0.5px",
                    color: "var(--expense)",
                  }}
                  required
                />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  若本期水電瓦斯實際繳費或折扣有所變動，請直接輸入實際支付金額。
                </div>
              </div>

              {/* Account Selector */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  扣款帳戶 (銀行、信用卡或現金) <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={editingItem.accountId}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, accountId: e.target.value })
                  }
                  className="input"
                  style={{ fontSize: 14 }}
                  required
                >
                  <AccountOptions accounts={accounts} />
                </select>
              </div>

              {/* Date & Note Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    扣款入帳日期
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={editingItem.occurredAt}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, occurredAt: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    交易備註說明
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={editingItem.note}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, note: e.target.value })
                    }
                    placeholder="項目說明"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 12,
                  marginTop: 8,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setEditingItem(null)}
                  disabled={confirmMutation.isPending}
                  style={{ padding: "8px 20px" }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={confirmMutation.isPending || !editingItem.amount || parseFloat(editingItem.amount) <= 0}
                  style={{
                    padding: "8px 24px",
                    fontWeight: 700,
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    borderColor: "#10b981",
                    color: "#fff",
                  }}
                >
                  {confirmMutation.isPending
                    ? "入帳處理中…"
                    : `確認扣款 NT$ ${Number(editingItem.amount || 0).toLocaleString()} 入帳`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
