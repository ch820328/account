"use client";

import React, { useState } from "react";
import { Amount } from "@/components/Amount";
import type { BudgetItem } from "./types";

export interface MajorCategoryEnvelope {
  key: string;
  name: string;
  label: string;
  icon: string;
  desc: string;
  annualBudgetMinor: string;
  pastSpentMinor: string;
  futureFixedMinor: string;
  safeToSpendMinor: string;
  monthlySafeToSpendMinor: string;
  itemsCount: number;
  fixedItemsCount: number;
  rollingItemsCount: number;
}

interface CategoryEnvelopesProps {
  envelopes: MajorCategoryEnvelope[];
  budgetItems: BudgetItem[];
  currentMonthIdx: number;
  remainingMonths: number;
  onStartEdit?: (item: BudgetItem) => void;
  onStartAdd?: () => void;
}

export function CategoryEnvelopes({
  envelopes,
  budgetItems,
  currentMonthIdx,
  remainingMonths,
  onStartEdit,
  onStartAdd,
}: CategoryEnvelopesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🌳</span> 食衣住行育樂 · 六大項分類預算與後續剩餘可花
          </h3>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            系統依「<strong>年度總預算 － 1~{Math.max(1, currentMonthIdx - 1)}月已花費 － 後續固定排程扣款 ＝ 後續剩下可花</strong>」，精準計算各分類未來的自由可支配額度。
          </p>
        </div>

        {onStartAdd && (
          <button
            type="button"
            className="btn ghost"
            onClick={onStartAdd}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            ＋ 新增項目掛載至六大分類
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        {envelopes.map((env) => {
          const annualNum = Number(env.annualBudgetMinor) / 100;
          const pastNum = Number(env.pastSpentMinor) / 100;
          const futureFixedNum = Number(env.futureFixedMinor) / 100;
          const safeNum = Number(env.safeToSpendMinor) / 100;
          const monthlySafeNum = Number(env.monthlySafeToSpendMinor) / 100;

          const pastPercent = annualNum > 0 ? Math.min(100, Math.round((pastNum / annualNum) * 100)) : 0;
          const futureFixedPercent = annualNum > 0 ? Math.min(100 - pastPercent, Math.round((futureFixedNum / annualNum) * 100)) : 0;
          const safePercent = Math.max(0, 100 - pastPercent - futureFixedPercent);

          const isExpanded = expandedKey === env.key;
          const matchedItems = budgetItems.filter((b) => {
            const p = b.parentCategoryName || "";
            const c = b.categoryName || "";
            return p.includes(env.name) || c.includes(env.name);
          });

          return (
            <div
              key={env.key}
              className="ff3-card"
              style={{
                padding: "16px 18px",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                transition: "all 0.2s ease",
                background: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.2) 100%)",
              }}
            >
              {/* Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{env.icon}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{env.name}</span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: env.itemsCount > 0 ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.05)",
                          color: env.itemsCount > 0 ? "#a5b4fc" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        {env.itemsCount} 項預算
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {env.desc}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>年度總額度</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "var(--fg)" }}>
                    ${annualNum.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Progress visual bar */}
              <div>
                <div
                  style={{
                    height: 8,
                    width: "100%",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 4,
                    display: "flex",
                    overflow: "hidden",
                    marginBottom: 6,
                  }}
                >
                  {/* Past spent bar */}
                  <div
                    style={{
                      width: `${pastPercent}%`,
                      background: "#60a5fa",
                      transition: "width 0.3s ease",
                    }}
                    title={`已花費: $${pastNum.toLocaleString()} (${pastPercent}%)`}
                  />
                  {/* Future fixed commitments bar */}
                  <div
                    style={{
                      width: `${futureFixedPercent}%`,
                      background: "#f59e0b",
                      transition: "width 0.3s ease",
                    }}
                    title={`後續固定預期扣款: $${futureFixedNum.toLocaleString()} (${futureFixedPercent}%)`}
                  />
                  {/* Safe to spend remaining */}
                  <div
                    style={{
                      width: `${safePercent}%`,
                      background: "#10b981",
                      transition: "width 0.3s ease",
                    }}
                    title={`後續剩下可花: $${safeNum.toLocaleString()} (${safePercent}%)`}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#60a5fa" }} />
                    已支 ${pastNum.toLocaleString()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                    後續固定 ${futureFixedNum.toLocaleString()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#34d399", fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                    剩餘可花 ${safeNum.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Safe to spend summary box */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: safeNum > 0 ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                  border: safeNum > 0 ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(239, 68, 68, 0.2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: safeNum > 0 ? "#34d399" : "#f87171", fontWeight: 600 }}>
                    👉 後續剩下可花（扣除固定開銷後）
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: safeNum > 0 ? "#10b981" : "#ef4444" }}>
                    ${safeNum.toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    剩餘 {remainingMonths} 個月平均
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: safeNum > 0 ? "#34d399" : "var(--muted)" }}>
                    ${monthlySafeNum.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>/月</span>
                  </div>
                </div>
              </div>

              {/* Matched items toggle & list */}
              {matchedItems.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setExpandedKey(isExpanded ? null : env.key)}
                    style={{
                      width: "100%",
                      fontSize: 11,
                      padding: "4px 8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>檢視包含的 {matchedItems.length} 項預算明細</span>
                    <span>{isExpanded ? "▲ 收合" : "▼ 展開"}</span>
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {matchedItems.map((it) => {
                        const itAnnual = Number(it.annualAmountMinor) / 100;
                        const isFixed = it.allocationType === "fixed_months";

                        return (
                          <div
                            key={it.id}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              background: "rgba(0,0,0,0.25)",
                              border: "1px solid rgba(255,255,255,0.04)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{it.icon || "📌"}</span>
                              <span style={{ fontWeight: 600 }}>{it.name}</span>
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: isFixed ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)",
                                  color: isFixed ? "#fbbf24" : "#a5b4fc",
                                }}
                              >
                                {isFixed ? `固定 ${it.targetMonths || ""}月` : "動態均攤"}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                                ${itAnnual.toLocaleString()}
                              </span>
                              {onStartEdit && (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ fontSize: 10, padding: "2px 5px" }}
                                  onClick={() => onStartEdit(it)}
                                >
                                  編輯
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
