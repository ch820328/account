"use client";

import { useState, useEffect } from "react";
import { AmountInput } from "@/components/AmountInput";
import { AccountOptions } from "@/components/AccountOptions";
import { CategoryOptions } from "@/components/CategoryOptions";
import { MonthSelector, parseMonthsList } from "./MonthSelector";
import { trpc } from "@/lib/trpc";
import { niceConfirm } from "@/lib/confirm";
import type { BudgetItem, ForecastAccount } from "./types";

const COMMON_ICONS = ["⚡", "🔥", "💧", "📱", "🌐", "🏠", "🛡️", "🚗", "💳", "📺", "☕", "🛒", "⚖️", "🧧", "🎁", "🏥"];

interface CategoryItem {
  id: string;
  name: string;
  kind?: string;
}

interface BudgetModalProps {
  isOpen: boolean;
  targetYear: number;
  editingItem: BudgetItem | null;
  accounts: ForecastAccount[];
  categories: CategoryItem[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: {
    id?: string;
    year: number;
    name: string;
    icon: string;
    annualAmount: string;
    allocationType: "rolling" | "fixed_months";
    targetMonths?: string;
    accountId?: string | null;
    categoryId?: string | null;
    matchPattern?: string;
    note?: string;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function BudgetModal({
  isOpen,
  targetYear,
  editingItem,
  accounts,
  categories,
  isSubmitting,
  onClose,
  onSubmit,
  onDelete,
}: BudgetModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("⚡");
  const [annualAmount, setAnnualAmount] = useState("");
  const [perPeriodAmount, setPerPeriodAmount] = useState("");
  const [currency, setCurrency] = useState<string>("TWD");
  const [exchangeRate, setExchangeRate] = useState<string>("1");
  const [allocationType, setAllocationType] = useState<"rolling" | "fixed_months">("fixed_months");
  const [targetMonths, setTargetMonths] = useState<string>("2,5,8,11");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [matchPattern, setMatchPattern] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fxRatesQuery = trpc.accounts.activeFxRates.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const liveFxRates = fxRatesQuery.data?.rates || [];

  const defaultCurrencies = ["TWD", "USD", "JPY", "EUR"];
  const accountCurrencies = accounts.map((a) => a.currency?.toUpperCase()).filter(Boolean);
  const rateCurrencies = liveFxRates.map((r) => r.currency?.toUpperCase());
  const allCurrencies = Array.from(new Set([...defaultCurrencies, ...accountCurrencies, ...rateCurrencies]));
  const otherCurrencies = allCurrencies.filter((c) => !defaultCurrencies.includes(c));

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setIcon(editingItem.icon || "⚡");
      const twdAnnual = String(Number(editingItem.annualAmountMinor) / 100);
      const isFixed = editingItem.allocationType === "fixed_months";
      setAllocationType(isFixed ? "fixed_months" : "rolling");
      const months = editingItem.targetMonths || (isFixed ? "2,5,8,11" : "");
      setTargetMonths(months);

      // Check if note contains original foreign currency memo [原幣: USD 6,000 @ 匯率 31.47]
      const acc = accounts.find((a) => a.id === editingItem.accountId);
      const noteMatch = editingItem.note?.match(/\[原幣:\s*([A-Z]{3})\s*([\d,.]+)(?:\s*@\s*匯率\s*([\d.]+))?\]/);

      let itemCurrency = "TWD";
      let itemRate = "1";
      let itemAnnual = twdAnnual;
      let cleanNote = editingItem.note || "";

      if (noteMatch && noteMatch[1] && noteMatch[2]) {
        itemCurrency = noteMatch[1];
        itemAnnual = noteMatch[2].replace(/,/g, "");
        if (noteMatch[3]) itemRate = noteMatch[3];
        cleanNote = cleanNote.replace(/\[原幣:[^\]]+\]/g, "").trim();
      } else if (acc?.currency && acc.currency.toUpperCase() !== "TWD") {
        itemCurrency = acc.currency.toUpperCase();
        const foundRate = liveFxRates.find((r) => r.currency === itemCurrency)?.rate;
        if (foundRate) {
          const roundedRate = Math.round(foundRate * 10000) / 10000;
          itemRate = String(roundedRate);
          itemAnnual = String(Math.round((Number(twdAnnual) / roundedRate) * 100) / 100);
        }
      }

      setCurrency(itemCurrency);
      setExchangeRate(itemRate);
      setAnnualAmount(itemAnnual);

      const monthsList = parseMonthsList(months);
      if (monthsList.length > 0 && Number(itemAnnual) > 0) {
        setPerPeriodAmount(String(Math.round((Number(itemAnnual) / monthsList.length) * 100) / 100));
      } else {
        setPerPeriodAmount("");
      }

      setAccountId(editingItem.accountId || "");
      setCategoryId(editingItem.categoryId || "");
      setMatchPattern(editingItem.matchPattern || "");
      setNote(cleanNote);
      setFormError(null);
    } else {
      setName("");
      setIcon("⚡");
      setAnnualAmount("");
      setPerPeriodAmount("");
      setCurrency("TWD");
      setExchangeRate("1");
      setAllocationType("fixed_months");
      setTargetMonths("2,5,8,11");
      setAccountId("");
      setCategoryId("");
      setMatchPattern("");
      setNote("");
      setFormError(null);
    }
  }, [editingItem, isOpen, accounts]);

  if (!isOpen) return null;

  const selectedMonthsList = parseMonthsList(targetMonths);
  const monthsCount = selectedMonthsList.length;

  function handleCurrencyChange(newCur: string) {
    if (newCur === currency) return;

    const oldRate = currency === "TWD" ? 1 : Number(exchangeRate) || 1;
    const rawNewRate =
      newCur === "TWD"
        ? 1
        : liveFxRates.find((r) => r.currency === newCur)?.rate || (newCur === "USD" ? 31.5 : newCur === "JPY" ? 0.21 : 1);
    const newRate = newCur === "TWD" ? 1 : Math.round(rawNewRate * 10000) / 10000;

    setCurrency(newCur);
    setExchangeRate(String(newRate));

    // Convert existing amounts smoothly if user already entered an amount
    if (annualAmount && Number(annualAmount) > 0) {
      const twdVal = Number(annualAmount) * oldRate;
      const convertedAnnual = newCur === "TWD" ? Math.round(twdVal) : Math.round((twdVal / newRate) * 100) / 100;
      setAnnualAmount(String(convertedAnnual));

      if (monthsCount > 0) {
        setPerPeriodAmount(
          newCur === "TWD"
            ? String(Math.round(convertedAnnual / monthsCount))
            : String(Math.round((convertedAnnual / monthsCount) * 100) / 100)
        );
      }
    }
  }

  function handleMonthsChange(newMonthsStr: string) {
    setTargetMonths(newMonthsStr);
    const newCount = parseMonthsList(newMonthsStr).length;
    if (perPeriodAmount && Number(perPeriodAmount) > 0 && newCount > 0) {
      setAnnualAmount(String(Math.round(Number(perPeriodAmount) * newCount * 100) / 100));
    } else if (annualAmount && Number(annualAmount) > 0 && newCount > 0) {
      setPerPeriodAmount(String(Math.round((Number(annualAmount) / newCount) * 100) / 100));
    }
  }

  function handlePerPeriodChange(val: string) {
    setPerPeriodAmount(val);
    const num = Number(val);
    if (!isNaN(num) && num > 0 && monthsCount > 0) {
      setAnnualAmount(String(Math.round(num * monthsCount * 100) / 100));
    } else if (!val) {
      setAnnualAmount("");
    }
  }

  function handleAnnualChange(val: string) {
    setAnnualAmount(val);
    const num = Number(val);
    if (!isNaN(num) && num > 0 && monthsCount > 0) {
      setPerPeriodAmount(String(Math.round((num / monthsCount) * 100) / 100));
    } else if (!val) {
      setPerPeriodAmount("");
    }
  }

  const currentRateNum = currency === "TWD" ? 1 : Number(exchangeRate) || 1;
  const convertedTwdTotal = Math.round(Number(annualAmount || 0) * currentRateNum);
  const rawLiveRate = liveFxRates.find((r) => r.currency === currency)?.rate;
  const liveMarketRate = rawLiveRate ? Math.round(rawLiveRate * 10000) / 10000 : null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.78)",
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
          width: "clamp(580px, 50vw, 1100px)",
          maxWidth: "95vw",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "24px 28px",
          background: "var(--card)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {editingItem ? "編輯固定開銷 / 預算項目" : "新增固定開銷 / 預算項目"}
              </h2>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {targetYear} 年度 · 精準排程 12 個月扣款預算
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            style={{ fontSize: 18, padding: "2px 8px" }}
          >
            ✕
          </button>
        </div>

        {editingItem?.isAutoLoan && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: "#38bdf8", marginBottom: 2 }}>
                🔗 此項目由【排程中心 ➜ 貸款管理】自動計算並同步
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                包含寬限期試算、利息與本金攤還排程。如需調整合約金額、期數或利率，請前往排程中心。
              </div>
            </div>
            <a
              href="/schedule?tab=loan"
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                whiteSpace: "nowrap",
                background: "rgba(56, 189, 248, 0.2)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                textDecoration: "none",
              }}
            >
              前往貸款管理 ↗
            </a>
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setFormError(null);
            if (allocationType === "fixed_months" && monthsCount === 0) {
              setFormError("固定月份扣款請至少點亮勾選一個扣款月份（例如 2, 5, 8, 11 月）");
              return;
            }
            if (!annualAmount || Number(annualAmount) <= 0) {
              setFormError("請填寫每期金額或全年度預算總額");
              return;
            }

            try {
              const finalTwdAmount =
                currency === "TWD"
                  ? annualAmount
                  : String(Math.round(Number(annualAmount) * (Number(exchangeRate) || 1)));

              let finalNote = note.trim();
              if (currency !== "TWD" && Number(annualAmount) > 0) {
                const foreignTag = `[原幣: ${currency} ${Number(annualAmount).toLocaleString()} @ 匯率 ${exchangeRate}]`;
                finalNote = finalNote.replace(/\[原幣:[^\]]+\]/g, "").trim();
                finalNote = finalNote ? `${finalNote} ${foreignTag}` : foreignTag;
              } else if (currency === "TWD") {
                finalNote = finalNote.replace(/\[原幣:[^\]]+\]/g, "").trim();
              }

              await onSubmit({
                id: editingItem?.id,
                year: targetYear,
                name,
                icon,
                annualAmount: finalTwdAmount,
                allocationType,
                targetMonths: allocationType === "fixed_months" ? targetMonths.trim() : undefined,
                accountId: accountId || null,
                categoryId: categoryId || null,
                matchPattern: matchPattern || undefined,
                note: finalNote || undefined,
              });
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              setFormError(message);
            }
          }}
        >
          {/* Allocation Mode Switcher */}
          <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(0,0,0,0.3)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 8, fontWeight: 600 }}>
              開銷扣款模式 *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: allocationType === "fixed_months" ? "rgba(245, 158, 11, 0.15)" : "transparent",
                  border: allocationType === "fixed_months" ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <input
                  type="radio"
                  name="allocationType"
                  value="fixed_months"
                  checked={allocationType === "fixed_months"}
                  onChange={() => setAllocationType("fixed_months")}
                />
                <div>
                  <div style={{ fontWeight: 700, color: allocationType === "fixed_months" ? "#fbbf24" : "var(--fg)" }}>
                    📌 固定開銷（指定月份）
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    季繳 (2,5,8,11)、年繳保費、稅金
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: allocationType === "rolling" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  border: allocationType === "rolling" ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <input
                  type="radio"
                  name="allocationType"
                  value="rolling"
                  checked={allocationType === "rolling"}
                  onChange={() => setAllocationType("rolling")}
                />
                <div>
                  <div style={{ fontWeight: 700, color: allocationType === "rolling" ? "#a5b4fc" : "var(--fg)" }}>
                    🔄 日常生活預算（每月固定額度）
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    水電瓦斯、日常開銷固定月額，即時累加累減差額
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Month Selector Component (Fixed Months Mode) */}
          {allocationType === "fixed_months" && (
            <div style={{ marginBottom: 14 }}>
              <MonthSelector
                value={targetMonths}
                onChange={handleMonthsChange}
              />
            </div>
          )}

          {/* Basic Info: Icon + Name */}
          <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                項目名稱 *
              </label>
              <input
                required
                placeholder="例如：季繳管理費、房屋稅、汽車保費"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!matchPattern) setMatchPattern(e.target.value);
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                圖示 (Emoji)
              </label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4, overflowX: "auto", maxWidth: 180 }}>
                  {COMMON_ICONS.slice(0, 5).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      style={{
                        padding: "4px 6px",
                        fontSize: 14,
                        background: icon === ic ? "rgba(245, 158, 11, 0.3)" : "rgba(0,0,0,0.2)",
                        border: icon === ic ? "1px solid #f59e0b" : "1px solid var(--border)",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="自訂"
                  style={{ width: 44, textAlign: "center", padding: "4px" }}
                />
              </div>
            </div>
          </div>

          {/* Amounts: Per-Period vs Annual Total with automatic bidirectional calc + Currency support */}
          <div
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              background: "rgba(0, 0, 0, 0.2)",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Currency Selector Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>
                預算扣款金額設定
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>幣別：</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {defaultCurrencies.map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => handleCurrencyChange(cur)}
                      style={{
                        padding: "2px 8px",
                        fontSize: 12,
                        fontWeight: currency === cur ? 700 : 500,
                        borderRadius: 4,
                        border: currency === cur ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.12)",
                        background: currency === cur ? "rgba(245, 158, 11, 0.25)" : "rgba(0,0,0,0.35)",
                        color: currency === cur ? "#fbbf24" : "var(--muted)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {cur}
                    </button>
                  ))}
                  {otherCurrencies.length > 0 && (
                    <select
                      value={defaultCurrencies.includes(currency) ? "" : currency}
                      onChange={(e) => e.target.value && handleCurrencyChange(e.target.value)}
                      style={{
                        padding: "2px 6px",
                        fontSize: 11,
                        borderRadius: 4,
                        background: !defaultCurrencies.includes(currency) ? "rgba(245, 158, 11, 0.25)" : "rgba(0,0,0,0.35)",
                        border: !defaultCurrencies.includes(currency) ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.12)",
                        color: !defaultCurrencies.includes(currency) ? "#fbbf24" : "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">其他...</option>
                      {otherCurrencies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Foreign Currency FX Rate Row */}
            {currency !== "TWD" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "8px 12px",
                  background: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  borderRadius: 6,
                  marginBottom: 10,
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>💱 外幣折算匯率：</span>
                <span style={{ color: "var(--fg)" }}>1 {currency} ＝</span>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  style={{
                    width: 100,
                    padding: "3px 8px",
                    fontSize: 12,
                    textAlign: "right",
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.25)",
                    background: "rgba(0,0,0,0.4)",
                    color: "#93c5fd",
                    fontWeight: 700,
                  }}
                />
                <span style={{ color: "var(--fg)" }}>NT$</span>
                {liveMarketRate && (
                  <button
                    type="button"
                    onClick={() => setExchangeRate(String(liveMarketRate))}
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      padding: "2px 8px",
                      background: "rgba(59, 130, 246, 0.2)",
                      border: "1px dashed rgba(96, 165, 250, 0.5)",
                      color: "#93c5fd",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                    title="點擊套用最新市場即時匯率"
                  >
                    即時匯率: {liveMarketRate}
                  </button>
                )}
              </div>
            )}

            {allocationType === "fixed_months" ? (
              <>
                <div className="grid cols-2" style={{ gap: 12, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "#fbbf24", display: "block", marginBottom: 4, fontWeight: 600 }}>
                      每期金額 ({currency}) {monthsCount > 0 && `(每年扣款 ${monthsCount} 次)`}
                    </label>
                    <AmountInput
                      placeholder={monthsCount > 0 ? "例如：15000" : "請先點亮月份"}
                      value={perPeriodAmount}
                      onChange={handlePerPeriodChange}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                      全年度預算總額 ({currency}) *
                    </label>
                    <AmountInput
                      required
                      placeholder="例如：60000"
                      value={annualAmount}
                      onChange={handleAnnualChange}
                    />
                  </div>
                </div>

                {monthsCount > 0 && Number(annualAmount) > 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#fbbf24",
                      background: "rgba(245, 158, 11, 0.1)",
                      padding: "8px 12px",
                      borderRadius: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div>
                      💡 換算結果：每期 <strong>{currency} {Number(perPeriodAmount || 0).toLocaleString()}</strong> × {monthsCount} 期 ({selectedMonthsList.map((m) => `${m}月`).join("、")}) ＝ 全年 <strong>{currency} {Number(annualAmount).toLocaleString()}</strong>
                    </div>
                    {currency !== "TWD" && (
                      <div style={{ color: "#93c5fd", borderTop: "1px dashed rgba(255,255,255,0.1)", paddingTop: 4, marginTop: 2 }}>
                        💱 折合台幣：約 <strong>NT$ {convertedTwdTotal.toLocaleString()}</strong>（以等值台幣計入年度總預算矩陣與月現金流）
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div>
                <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  全年度生活預算總額 ({currency}) *
                </label>
                <AmountInput
                  required
                  placeholder="例如：240000"
                  value={annualAmount}
                  onChange={setAnnualAmount}
                />
                {Number(annualAmount) > 0 && (
                  <div style={{ fontSize: 12, color: "#a5b4fc", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                    <div>
                      🔄 平均每月基準額度：{currency} {Math.round((Number(annualAmount) / 12) * 100) / 100} / 月
                    </div>
                    {currency !== "TWD" && (
                      <div style={{ color: "#93c5fd" }}>
                        💱 折合台幣：約 NT$ {Math.round(convertedTwdTotal / 12).toLocaleString()} / 月（全年約 NT$ {convertedTwdTotal.toLocaleString()}）
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Account & Category */}
          <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                付款方式 / 扣款帳戶 (預估帳戶金流增減)
              </label>
              <select
                value={accountId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setAccountId(newId);
                  if (newId) {
                    const acc = accounts.find((a) => a.id === newId);
                    if (acc?.currency && acc.currency.toUpperCase() !== currency) {
                      handleCurrencyChange(acc.currency.toUpperCase());
                    }
                  }
                }}
              >
                <option value="">(未指定付款方式)</option>
                <AccountOptions accounts={accounts} />
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                關聯支出分類
              </label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">(未指定分類)</option>
                <CategoryOptions categories={categories} kind="expense" />
              </select>
            </div>
          </div>

          {/* Match Pattern & Notes */}
          <div className="grid cols-2" style={{ gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                自動對帳關鍵字
              </label>
              <input
                placeholder="符合即自動採計實際扣款"
                value={matchPattern}
                onChange={(e) => setMatchPattern(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                備註說明
              </label>
              <input
                placeholder="選填備註"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {formError && (
            <div
              style={{
                padding: "8px 12px",
                marginBottom: 12,
                borderRadius: 6,
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "var(--expense)",
                fontSize: 12,
              }}
            >
              {formError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: editingItem && onDelete ? "space-between" : "flex-end", alignItems: "center", gap: 10, marginTop: 20 }}>
            {editingItem && onDelete && (
              <button
                type="button"
                className="btn ghost"
                disabled={isSubmitting || isDeleting}
                onClick={async () => {
                  if (editingItem.isAutoLoan) {
                    await niceConfirm(
                      "無法直接刪除",
                      "此項目由【排程中心 ➜ 貸款管理】自動同步試算。若需停用或修改，請至排程中心管理貸款合約。",
                      "warning"
                    );
                    return;
                  }
                  const ok = await niceConfirm(
                    "刪除預算項目",
                    `確定要刪除「${editingItem.name}」嗎？此操作無法復原。`,
                    "danger"
                  );
                  if (ok) {
                    setIsDeleting(true);
                    try {
                      await onDelete(editingItem.id);
                      onClose();
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }}
                style={{
                  color: "var(--expense)",
                  borderColor: "rgba(239, 68, 68, 0.4)",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  padding: "8px 14px",
                }}
              >
                <span>🗑️</span>
                <span>{isDeleting ? "刪除中…" : "刪除此項目"}</span>
              </button>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={onClose}
                disabled={isSubmitting || isDeleting}
              >
                取消
              </button>
              <button
                type="submit"
                className="btn"
                disabled={isSubmitting || isDeleting || Boolean(editingItem?.isAutoLoan)}
                style={{ minWidth: 100 }}
              >
                {editingItem?.isAutoLoan
                  ? "由貸款排程自動維護"
                  : isSubmitting
                  ? "儲存中…"
                  : editingItem
                  ? "更新設定"
                  : "確認建立"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
