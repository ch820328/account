"use client";

import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import { niceConfirm } from "@/lib/confirm";
import type { BudgetItem } from "./types";

interface BudgetsTabProps {
  isLoading: boolean;
  budgetItems: BudgetItem[];
  isDeleting: boolean;
  onStartAdd: () => void;
  onStartEdit: (item: BudgetItem) => void;
  onDelete: (id: string) => Promise<void>;
}

export function BudgetsTab({
  isLoading,
  budgetItems,
  isDeleting,
  onStartAdd,
  onStartEdit,
  onDelete,
}: BudgetsTabProps) {
  if (isLoading) {
    return <SkeletonList rows={3} />;
  }

  if (budgetItems.length === 0) {
    return (
      <div className="ff3-card" style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)", marginBottom: 4 }}>
          尚未建立年度預算項目
        </div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          設定水電瓦斯（動態均攤）或房屋稅/地價稅（固定月份扣款），輕鬆預估金流。
        </div>
        <button type="button" className="btn" onClick={onStartAdd}>
          ＋ 建立第一個年度預算
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 16 }}>
      {budgetItems.map((b) => {
        const percentUsed =
          b.annualAmountMinor > 0n
            ? Math.min(100, Math.round((Number(b.spentAmountMinor) / Number(b.annualAmountMinor)) * 100))
            : 0;
        const isFixed = b.allocationType === "fixed_months";

        return (
          <div
            key={b.id}
            className="ff3-card"
            style={{
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{b.icon || "⚡"}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{b.name}</span>
                    {b.isAutoLoan && (
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                          background: "rgba(56, 189, 248, 0.15)",
                          color: "#38bdf8",
                          border: "1px solid rgba(56, 189, 248, 0.35)",
                        }}
                        title="由【排程中心 ➜ 貸款管理】自動同步試算"
                      >
                        🔗 貸款排程自動同步
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontWeight: 600,
                        background: isFixed ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)",
                        color: isFixed ? "#fbbf24" : "#a5b4fc",
                        border: isFixed ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(99, 102, 241, 0.3)",
                      }}
                    >
                      {isFixed ? `📌 固定 ${b.targetMonths || "無"} 月` : "🔄 動態滾動均攤"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {b.accountName && <span>🏦 {b.accountName}</span>}
                    {b.categoryName && <span>• 🏷️ {b.categoryName}</span>}
                    {b.matchPattern && <span>• 🔍 「{b.matchPattern}」</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 12, padding: "4px 8px" }}
                  onClick={() => onStartEdit(b)}
                >
                  編輯
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ fontSize: 12, padding: "4px 8px", color: "var(--expense)" }}
                  disabled={isDeleting}
                  onClick={async () => {
                    if (b.isAutoLoan) {
                      await niceConfirm(
                        "無法直接刪除",
                        "此項目由【排程中心 ➜ 貸款管理】自動同步試算。若需停用或修改，請至排程中心管理貸款合約。",
                        "warning"
                      );
                      return;
                    }
                    const ok = await niceConfirm("刪除年度預算", `確定要刪除「${b.name}」的年度預算設定嗎？`, "danger");
                    if (ok) {
                      await onDelete(b.id);
                    }
                  }}
                >
                  刪除
                </button>
              </div>
            </div>

            {/* Amounts Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                padding: "12px",
                background: "rgba(0,0,0,0.2)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div>
                <div style={{ color: "var(--muted)" }}>年度總預算</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
                  <Amount value={b.annualAmountMinor} currency="TWD" />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {isFixed
                    ? `指定 ${b.targetMonthsList.length} 個月份扣款`
                    : `基準均攤: NT$ ${Math.round(Number(b.annualAmountMinor) / 1200)}/月`}
                </div>
              </div>

              <div>
                <div style={{ color: "var(--muted)" }}>至今已實支</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#60a5fa" }}>
                  <Amount value={b.spentAmountMinor} currency="TWD" />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  已耗用 {percentUsed}%
                </div>
              </div>

              <div>
                <div style={{ color: "var(--muted)" }}>剩餘可用額度</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "var(--income)" }}>
                  <Amount value={b.remainingAmountMinor} currency="TWD" />
                </div>
              </div>

              <div>
                <div style={{ color: "var(--muted)" }}>
                  {isFixed ? "每期指定扣除" : `未來剩餘 ${b.remainingMonthsCount} 個月均攤`}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "#facc15" }}>
                  <Amount value={b.dynamicFutureMonthlyMinor} currency="TWD" />
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>
                    {isFixed ? "/期" : "/月"}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ height: 6, width: "100%", background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${percentUsed}%`,
                    background: percentUsed > 90 ? "var(--expense)" : "linear-gradient(90deg, #6366f1, #10b981)",
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>

            {b.note && (
              <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                📝 {b.note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
