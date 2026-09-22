"use client";

import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { CategoryOptions } from "@/components/CategoryOptions";
import { AmountInput } from "@/components/AmountInput";
import { todayIso } from "@/lib/labels";

interface CreditTransactionModalProps {
  open: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  creditAccounts: Array<{
    id?: string | null;
    name: string;
    currency: string;
    cardNumber?: string | null;
    accountNumber?: string | null;
  }>;
  month?: string;
  onSuccess?: () => void;
}

const COMMON_EXPENSE_NOTES = [
  "麥當勞",
  "便利商店",
  "家樂福",
  "全聯福利中心",
  "Uber",
  "高鐵購票",
  "餐廳聚餐",
  "加油費",
  "蝦皮購物",
  "Google Play",
  "App Store",
];

const INSTALLMENT_PERIODS = [3, 6, 12, 24, 30];

export function CreditTransactionModal({
  open,
  onClose,
  defaultAccountId,
  creditAccounts,
  month,
  onSuccess,
}: CreditTransactionModalProps) {
  const utils = trpc.useUtils();
  const categoriesQuery = trpc.categories.list.useQuery();

  const [mode, setMode] = useState<"single" | "installment">("single");

  // Single transaction state
  const [accountId, setAccountId] = useState<string>("");
  const [date, setDate] = useState<string>(todayIso());
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [statementMonth, setStatementMonth] = useState<string>("");

  // Installment schedule state
  const [instName, setInstName] = useState<string>("");
  const [instTotalAmount, setInstTotalAmount] = useState<string>("");
  const [instPeriodAmount, setInstPeriodAmount] = useState<string>("");
  const [instPeriods, setInstPeriods] = useState<number>(6);
  const [instDayOfMonth, setInstDayOfMonth] = useState<number>(1);
  const [instFirstMonth, setInstFirstMonth] = useState<string>("");
  const [instCategoryId, setInstCategoryId] = useState<string>("");
  const [instNote, setInstNote] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const amountRef = useRef<HTMLInputElement>(null);

  // Initialize defaults on open
  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);

      const targetAccId =
        defaultAccountId && creditAccounts.some((c) => c.id === defaultAccountId)
          ? defaultAccountId
          : creditAccounts[0]?.id || "";

      setAccountId(targetAccId);
      setDate(todayIso());
      setAmount("");
      setNote("");
      setCategoryId("");

      const currentMonthStr = month || new Date().toISOString().slice(0, 7);
      setStatementMonth(currentMonthStr);
      setInstFirstMonth(currentMonthStr);

      setInstName("");
      setInstTotalAmount("");
      setInstPeriodAmount("");
      setInstPeriods(6);
      setInstDayOfMonth(1);
      setInstCategoryId("");
      setInstNote("");

      setTimeout(() => {
        amountRef.current?.focus();
      }, 120);
    }
  }, [open, defaultAccountId, creditAccounts, month]);

  // Handle total amount change to auto-calculate installment period amount
  const handleInstTotalAmountChange = (totalVal: string) => {
    setInstTotalAmount(totalVal);
    const num = parseFloat(totalVal);
    if (!isNaN(num) && num > 0 && instPeriods > 0) {
      setInstPeriodAmount(Math.ceil(num / instPeriods).toString());
    }
  };

  // Handle periods change to recalculate installment period amount
  const handlePeriodsChange = (periods: number) => {
    setInstPeriods(periods);
    const num = parseFloat(instTotalAmount);
    if (!isNaN(num) && num > 0 && periods > 0) {
      setInstPeriodAmount(Math.ceil(num / periods).toString());
    }
  };

  const createTransaction = trpc.transactions.create.useMutation();
  const createInstallment = trpc.installments.create.useMutation();

  if (!open) return null;

  const selectedCard = creditAccounts.find((c) => c.id === accountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError("請選擇信用卡帳戶");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "single") {
        if (!amount || parseFloat(amount) <= 0) {
          setError("請輸入大於 0 的消費金額");
          setSubmitting(false);
          return;
        }

        const occurredDate = new Date(`${date}T12:00:00`);

        await createTransaction.mutateAsync({
          accountId,
          categoryId: categoryId || undefined,
          type: "expense",
          amount,
          currency: selectedCard?.currency || "TWD",
          occurredAt: occurredDate,
          note: note.trim() || undefined,
          statementMonth: statementMonth.trim() || undefined,
        });
      } else {
        // Installment
        if (!instName.trim()) {
          setError("請輸入分期項目名稱");
          setSubmitting(false);
          return;
        }
        if (!instPeriodAmount || parseFloat(instPeriodAmount) <= 0) {
          setError("請輸入每期分期金額");
          setSubmitting(false);
          return;
        }

        await createInstallment.mutateAsync({
          accountId,
          name: instName.trim(),
          amount: instPeriodAmount,
          currency: selectedCard?.currency || "TWD",
          totalPeriods: instPeriods,
          dayOfMonth: instDayOfMonth,
          firstMonth: instFirstMonth.trim() || undefined,
          categoryId: instCategoryId || undefined,
          note: instNote.trim() || undefined,
        });
      }

      // Invalidate queries
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.upcoming.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.installments.list.invalidate(),
        utils.netWorth.summary.invalidate(),
      ]);

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      console.error("Failed to create credit transaction:", err);
      setError(err?.message || "新增失敗，請檢查輸入內容");
    } finally {
      setSubmitting(false);
    }
  };

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
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(640px, 50vw, 1100px)",
          maxWidth: "95vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(99, 102, 241, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          background: "linear-gradient(180deg, #182234 0%, #0f172a 100%)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.03)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <span>💳</span> 新增信用卡消費
            </h3>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
              手動記錄單筆信用卡刷卡消費，或建立多期分期付款排程
            </p>
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 16, padding: "4px 10px", lineHeight: 1 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher: Single vs Installment */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "rgba(0, 0, 0, 0.2)",
            padding: "6px 24px",
            gap: 12,
          }}
        >
          <button
            type="button"
            className="btn ghost"
            style={{
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: mode === "single" ? 700 : 500,
              background: mode === "single" ? "rgba(99, 102, 241, 0.25)" : "transparent",
              border: mode === "single" ? "1px solid var(--primary)" : "1px solid transparent",
              color: mode === "single" ? "var(--fg)" : "var(--muted)",
              borderRadius: 8,
            }}
            onClick={() => setMode("single")}
          >
            🛒 一般單筆刷卡
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{
              padding: "7px 18px",
              fontSize: 13,
              fontWeight: mode === "installment" ? 700 : 500,
              background: mode === "installment" ? "rgba(99, 102, 241, 0.25)" : "transparent",
              border: mode === "installment" ? "1px solid var(--primary)" : "1px solid transparent",
              color: mode === "installment" ? "var(--fg)" : "var(--muted)",
              borderRadius: 8,
            }}
            onClick={() => setMode("installment")}
          >
            📅 信用卡分期付款排程
          </button>
        </div>

        {/* Modal Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "20px 24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid #ef4444",
                borderRadius: 8,
                color: "#fca5a5",
                fontSize: 13,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Credit Card Account Selector */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              選擇信用卡片 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {creditAccounts.map((card) => {
                const isSelected = accountId === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => setAccountId(card.id || "")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: isSelected ? "2px solid #6366f1" : "1px solid var(--border)",
                      background: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.03)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>💳</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{card.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {card.cardNumber ? `•••• ${card.cardNumber.slice(-4)}` : card.currency}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#6366f1",
                          background: "rgba(99, 102, 241, 0.2)",
                          padding: "2px 6px",
                          borderRadius: 6,
                        }}
                      >
                        ✓ 已選取
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {mode === "single" ? (
            /* =================== SINGLE EXPENSE FIELDS =================== */
            <>
              {/* Row 1: Amount & Date */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    消費金額 ({selectedCard?.currency || "TWD"}) <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <AmountInput
                    ref={amountRef}
                    value={amount}
                    onChange={setAmount}
                    placeholder="0"
                    className="input"
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      letterSpacing: "0.5px",
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    刷卡日期 <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Row 2: Note / Merchant */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  消費項目 / 商家名稱
                </label>
                <input
                  type="text"
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：麥當勞、家樂福、Uber、高鐵購票…"
                />
                {/* Quick chip suggestions */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {COMMON_EXPENSE_NOTES.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setNote(preset)}
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        borderRadius: 12,
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                      className="hover-btn"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Category & Statement Month */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    費用分類
                  </label>
                  <select
                    className="input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">(未分類)</option>
                    <CategoryOptions categories={categoriesQuery.data ?? []} kind="expense" />
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    帳單請款月 (選填)
                  </label>
                  <input
                    type="month"
                    className="input"
                    value={statementMonth}
                    onChange={(e) => setStatementMonth(e.target.value)}
                    placeholder="YYYY-MM"
                  />
                </div>
              </div>
            </>
          ) : (
            /* =================== INSTALLMENT FIELDS =================== */
            <>
              {/* Row 1: Item Name */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  分期項目名稱 <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={instName}
                  onChange={(e) => setInstName(e.target.value)}
                  placeholder="例如：日立537L五門冰箱、LG洗衣機、升降電腦桌…"
                  required
                />
              </div>

              {/* Row 2: Periods & Amount Calculation */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    分期總金額 (選填，自動試算)
                  </label>
                  <AmountInput
                    value={instTotalAmount}
                    onChange={handleInstTotalAmountChange}
                    placeholder="例如：48500"
                    className="input"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    每期扣款金額 <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <AmountInput
                    value={instPeriodAmount}
                    onChange={setInstPeriodAmount}
                    placeholder="例如：8083"
                    className="input"
                    style={{ fontWeight: 700, fontFamily: "monospace" }}
                    required
                  />
                </div>
              </div>

              {/* Quick Period Buttons */}
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  總分期期數：<span style={{ color: "#6366f1", fontWeight: 700 }}>{instPeriods} 期</span>
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {INSTALLMENT_PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePeriodsChange(p)}
                      style={{
                        padding: "6px 14px",
                        fontSize: 12,
                        borderRadius: 8,
                        fontWeight: instPeriods === p ? 700 : 500,
                        background: instPeriods === p ? "rgba(99, 102, 241, 0.25)" : "rgba(255, 255, 255, 0.05)",
                        border: instPeriods === p ? "1px solid #6366f1" : "1px solid var(--border)",
                        color: instPeriods === p ? "#a5b4fc" : "var(--fg)",
                        cursor: "pointer",
                      }}
                    >
                      {p} 期
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: First Month & Day of Month */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    首次請款月份 (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    className="input"
                    value={instFirstMonth}
                    onChange={(e) => setInstFirstMonth(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    每月扣款日 (1 ~ 31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="input"
                    value={instDayOfMonth}
                    onChange={(e) => setInstDayOfMonth(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
              </div>

              {/* Category & Note */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    費用分類
                  </label>
                  <select
                    className="input"
                    value={instCategoryId}
                    onChange={(e) => setInstCategoryId(e.target.value)}
                  >
                    <option value="">(未分類)</option>
                    <CategoryOptions categories={categoriesQuery.data ?? []} kind="expense" />
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    備註說明
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={instNote}
                    onChange={(e) => setInstNote(e.target.value)}
                    placeholder="選填備註"
                  />
                </div>
              </div>
            </>
          )}

          {/* Modal Footer Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 10,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              className="btn ghost"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: "8px 20px" }}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn"
              disabled={submitting}
              style={{
                padding: "8px 24px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                borderColor: "#6366f1",
              }}
            >
              {submitting ? "儲存中…" : mode === "single" ? "確認新增消費" : "確認建立分期排程"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
