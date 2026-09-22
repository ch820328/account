"use client";

import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { fmt } from "@/lib/format";
import { CategoryOptions } from "@/components/CategoryOptions";
import { CategoryPickerModal } from "@/components/CategoryPickerModal";

interface CategoryTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  month: string;
  categoryId?: string | null;
  categoryIds?: string[];
  totalAmountMinor?: bigint;
  currency?: string;
  categories?: any[];
  onChanged?: () => void;
}

export function CategoryTransactionsModal({
  isOpen,
  onClose,
  title,
  month,
  categoryId,
  categoryIds,
  totalAmountMinor,
  currency = "TWD",
  categories = [],
  onChanged,
}: CategoryTransactionsModalProps) {
  const utils = trpc.useUtils();
  const [pickerTarget, setPickerTarget] = useState<{
    id: string;
    categoryId: string | null;
    note: string;
  } | null>(null);

  const categoriesQuery = trpc.categories.list.useQuery(undefined, {
    enabled: isOpen && (!categories || categories.length === 0),
  });
  const allCategories = categories && categories.length > 0 ? categories : categoriesQuery.data ?? [];

  const { data, isLoading, refetch } = trpc.transactions.list.useQuery(
    {
      month,
      type: "expense",
      categoryId: categoryId || undefined,
      categoryIds: categoryIds && categoryIds.length > 0 ? categoryIds : undefined,
      limit: 200,
    },
    {
      enabled: isOpen,
    }
  );

  const updateMutation = trpc.transactions.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refetch(),
        utils.transactions.monthCategories.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.transactions.list.invalidate(),
        utils.annualBudgets.list.invalidate(),
      ]);
      if (onChanged) onChanged();
    },
  });

  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        refetch(),
        utils.transactions.monthCategories.invalidate(),
        utils.transactions.monthlyBreakdown.invalidate(),
        utils.transactions.list.invalidate(),
        utils.annualBudgets.list.invalidate(),
      ]);
      if (onChanged) onChanged();
    },
  });

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const items = data?.items || [];
  const computedTotalMinor = useMemo(() => {
    if (items.length > 0) {
      return items.reduce((acc, t) => acc + BigInt(t.amountMinor), 0n);
    }
    return totalAmountMinor ?? 0n;
  }, [items, totalAmountMinor]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(560px, 60vw, 880px)",
          maxWidth: "96vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(180deg, #182234 0%, #0f172a 100%)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.15)",
          borderRadius: 14,
          overflow: "hidden",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📊</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f8fafc" }}>
                {title}
              </h3>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#a5b4fc",
                  fontWeight: 600,
                }}
              >
                {month} 月份
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              共 {items.length} 筆明細 · 當月合計{" "}
              <strong style={{ color: "var(--expense)", fontSize: 13 }}>
                {fmt(computedTotalMinor, currency)}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "var(--muted)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 15,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.color = "var(--muted)";
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Items List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {isLoading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
              載入明細中...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
              此分類在 {month} 尚無任何支出交易
            </div>
          ) : (
            items.map((t) => {
              const dt = new Date(t.occurredAt);
              const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;

              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    gap: 12,
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.25)")}
                >
                  {/* Left: Date, Note, Category, Account */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontFamily: "var(--font-mono, monospace)",
                          color: "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        📅 {dateStr}
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "#f8fafc",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={t.note || "無備註"}
                      >
                        {t.note || "無備註"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
                      {(() => {
                        const isUncat = !t.categoryId || t.categoryName === "未分類" || !t.categoryName;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setPickerTarget({
                                id: t.id,
                                categoryId: t.categoryId,
                                note: t.note || t.accountName,
                              })
                            }
                            style={{
                              fontSize: 10.5,
                              padding: "2px 8px",
                              borderRadius: 5,
                              background: isUncat ? "rgba(239, 68, 68, 0.16)" : "rgba(99, 102, 241, 0.12)",
                              color: isUncat ? "#fca5a5" : "#a5b4fc",
                              border: isUncat ? "1.5px solid #ef4444" : "1px solid rgba(99, 102, 241, 0.25)",
                              boxShadow: isUncat ? "0 0 8px rgba(239, 68, 68, 0.3)" : "none",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontWeight: isUncat ? 700 : 500,
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
                                e.currentTarget.style.background = "rgba(99, 102, 241, 0.12)";
                                e.currentTarget.style.borderColor = "rgba(99, 102, 241, 0.25)";
                                e.currentTarget.style.color = "#a5b4fc";
                              }
                            }}
                            title="點擊修改分類"
                          >
                            <span>🏷️ {t.categoryName || "未分類"}</span>
                            <span style={{ fontSize: 9, opacity: isUncat ? 0.9 : 0.6 }}>✏️</span>
                          </button>
                        );
                      })()}

                      {/* Account badge */}
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "var(--muted)",
                        }}
                      >
                        💳 {t.accountName}
                      </span>

                      {/* Statement month if credit card */}
                      {t.statementMonth && (
                        <span
                          style={{
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: "rgba(59, 130, 246, 0.15)",
                            color: "#93c5fd",
                            fontSize: 10,
                          }}
                        >
                          🗓️ {t.statementMonth.slice(5)}月帳單
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount and Delete */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "var(--expense)",
                        fontFamily: "var(--font-mono, monospace)",
                        textAlign: "right",
                      }}
                    >
                      −{fmt(BigInt(t.amountMinor), t.currency)}
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`確定要刪除「${t.note || "此筆交易"}」嗎？`)) {
                          await deleteMutation.mutateAsync({ id: t.id });
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--muted)",
                        cursor: "pointer",
                        padding: 4,
                        fontSize: 12,
                        opacity: 0.6,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "#f87171";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "var(--muted)";
                      }}
                      title="刪除交易"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "rgba(0, 0, 0, 0.2)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            提示：可點擊每筆項目的分類標籤 ✏️ 直接修改分類
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 13, padding: "6px 16px" }}
            onClick={onClose}
          >
            關閉
          </button>
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
        onSelect={async (newCatId) => {
          if (pickerTarget && newCatId !== pickerTarget.categoryId) {
            await updateMutation.mutateAsync({
              id: pickerTarget.id,
              categoryId: newCatId || null,
            });
          }
        }}
      />
    </div>
  );
}
