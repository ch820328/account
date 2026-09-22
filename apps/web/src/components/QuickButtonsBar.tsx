"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { fmtDate } from "@/lib/format";
import { QuickButtonsModal } from "@/components/QuickButtonsModal";
import { QuickButtonEntryModal, type QuickButtonData } from "@/components/QuickButtonEntryModal";

export function QuickButtonsBar({
  month,
  onTransactionCreated,
}: {
  month?: string;
  onTransactionCreated?: () => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [activeButton, setActiveButton] = useState<QuickButtonData | null>(null);

  const query = trpc.quickButtons.list.useQuery({ month });

  const buttons = query.data ?? [];
  const displayMonth = month || new Date().toISOString().slice(0, 7);
  const monthParts = displayMonth.split("-");
  const monthLabel = `${monthParts[0]}年${Number(monthParts[1])}月`;

  return (
    <>
      <div
        className="ff3-card"
        style={{
          padding: "14px 18px",
          marginBottom: 16,
          background: "linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>
              水電瓦斯 / 快捷按鈕
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              ({monthLabel} 狀態)
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a
              href="/budgets"
              className="btn ghost"
              style={{ fontSize: 12, padding: "3px 10px", textDecoration: "none" }}
              title="查看全年度開銷預算動態均攤與各月份扣款總表"
            >
              📅 年度預算與開銷管理
            </a>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 12, padding: "3px 10px" }}
              onClick={() => setManageOpen(true)}
            >
              ⚙️ 編輯按鈕與數量
            </button>
          </div>
        </div>

        {query.isLoading ? (
          <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>
            載入按鈕狀態中…
          </div>
        ) : buttons.length === 0 ? (
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: 6,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              color: "var(--muted)",
            }}
          >
            <span>尚未設定快捷按鈕，您可以點擊右側新增水電、瓦斯等常用項目。</span>
            <button
              type="button"
              className="btn"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => setManageOpen(true)}
            >
              ＋ 新增快捷按鈕
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {buttons.map((btn) => {
              if (btn.isRecorded) {
                // Already recorded this month -> Grayed out / disabled
                const amountText = btn.recordedTx
                  ? `NT$ ${Number(btn.recordedTx.amountMinor) / 100}`
                  : "";
                const recordDateText = btn.recordedTx
                  ? fmtDate(btn.recordedTx.occurredAt)
                  : "";

                return (
                  <button
                    key={btn.id}
                    type="button"
                    disabled
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      color: "var(--muted)",
                      cursor: "not-allowed",
                      fontSize: 13,
                      opacity: 0.65,
                      userSelect: "none",
                    }}
                    title={`當月已於 ${recordDateText} 記錄此費用 (${amountText})`}
                  >
                    <span style={{ fontSize: 16 }}>{btn.icon || "⚡"}</span>
                    <span style={{ textDecoration: "line-through" }}>{btn.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--income)",
                        background: "rgba(53, 196, 141, 0.12)",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontWeight: 600,
                      }}
                    >
                      ✅ 已記 {amountText}
                    </span>
                  </button>
                );
              }

              // Not recorded yet -> Active vibrant button, clicking opens entry modal
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setActiveButton(btn as any)}
                  className="btn"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(168, 85, 247, 0.22) 100%)",
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                    color: "var(--fg)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.2)",
                    transition: "transform 0.1s ease, border-color 0.15s ease",
                  }}
                  title="點擊立即帶入此名稱與種類記帳"
                >
                  <span style={{ fontSize: 16 }}>{btn.icon || "⚡"}</span>
                  <span>{btn.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(234, 179, 8, 0.18)",
                      color: "#facc15",
                      fontWeight: 600,
                    }}
                  >
                    待記
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Buttons Management Modal */}
      <QuickButtonsModal
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        onUpdated={() => query.refetch()}
      />

      {/* One-click Entry Modal */}
      <QuickButtonEntryModal
        button={activeButton}
        onClose={() => setActiveButton(null)}
        onSuccess={() => {
          query.refetch();
          onTransactionCreated?.();
        }}
      />
    </>
  );
}
