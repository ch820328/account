import React from "react";
import type { BudgetItem } from "../types";
import { getAccountIcon } from "./MatrixTypes";
import { niceConfirm } from "@/lib/confirm";

interface MatrixRollingSectionProps {
  rollingItems: BudgetItem[];
  budgetItems: BudgetItem[];
  currentMonthIdx: number;
  draggedId: string | null;
  dragOverId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string, allocationType: "fixed_months" | "rolling") => void;
  onAutoSort: (allocationType: "fixed_months" | "rolling", sortBy: "months" | "amount" | "name") => void;
  onMove: (id: string, allocationType: "fixed_months" | "rolling", direction: "up" | "down") => void;
  onStartEdit?: (item: BudgetItem) => void;
  onDelete?: (id: string) => Promise<void>;
  onOpenBillModal: (item: BudgetItem) => void;
  onTogglePaid?: (transactionId: string, willBePaid: boolean) => Promise<void> | void;
}

export function MatrixRollingSection({
  rollingItems,
  budgetItems,
  currentMonthIdx,
  draggedId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onAutoSort,
  onMove,
  onStartEdit,
  onDelete,
  onOpenBillModal,
  onTogglePaid,
}: MatrixRollingSectionProps) {
  if (rollingItems.length === 0) return null;

  return (
    <>
      <tr style={{ background: "rgba(99, 102, 241, 0.06)", borderTop: "1px solid rgba(99, 102, 241, 0.2)" }}>
        <td
          colSpan={17}
          style={{
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "#a5b4fc",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>🔄 日常生活預算（固定月額 · 累加累減結餘）</span>
              <button
                type="button"
                onClick={() => {
                  onOpenBillModal(rollingItems[0] || budgetItems[0]!);
                }}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  color: "#38bdf8",
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                title="登記與檢視水電瓦斯等延續性週期帳單，支援精準按日跨月均攤"
              >
                🧾 週期帳單管理與均攤
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "normal" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>快速排序：</span>
              <button
                type="button"
                onClick={() => onAutoSort("rolling", "amount")}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#a5b4fc",
                  cursor: "pointer",
                }}
                title="依金額由大到小排序"
              >
                💰 金額大小
              </button>
              <button
                type="button"
                onClick={() => onAutoSort("rolling", "name")}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  color: "#a5b4fc",
                  cursor: "pointer",
                }}
                title="依名稱字首排序"
              >
                🔤 名稱
              </button>
            </div>
          </div>
        </td>
      </tr>

      {rollingItems.map((b, idx) => {
        const annual = Number(b.annualAmountMinor) / 100;
        const baseMonthly = Math.round(annual / 12);

        return (
          <tr
            key={b.id}
            draggable
            onDragStart={(e) => onDragStart(e, b.id)}
            onDragOver={(e) => onDragOver(e, b.id)}
            onDragLeave={(e) => onDragLeave(e, b.id)}
            onDrop={(e) => onDrop(e, b.id, "rolling")}
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              borderTop: dragOverId === b.id ? "2px solid #6366f1" : undefined,
              opacity: draggedId === b.id ? 0.4 : 1,
              transition: "background 0.15s ease",
            }}
            className="hover-row"
          >
            <td style={{ padding: "8px 10px", textAlign: "left" }}>
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    cursor: "grab",
                    color: "rgba(255,255,255,0.3)",
                    fontSize: 13,
                    userSelect: "none",
                  }}
                  title="按住拖曳可自訂上下順序"
                >
                  ⠿
                </span>
                <span>{b.icon || "🔄"}</span>
                <span>{b.name}</span>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 3,
                  paddingLeft: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span>
                  {b.parentCategoryName ? (
                    <span style={{ color: "#a5b4fc", fontWeight: 600, marginRight: 3 }}>
                      {b.parentCategoryName} ·
                    </span>
                  ) : null}
                  <span>{b.categoryName ? b.categoryName : "未分類"}</span>
                </span>

                <span style={{ opacity: 0.35 }}>•</span>

                {b.accountName ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#e2e8f0",
                      fontWeight: 500,
                      fontSize: 10.5,
                    }}
                    title={`付款方式 / 扣款帳戶: ${b.accountName}${b.accountCurrency ? ` (${b.accountCurrency})` : ""}`}
                  >
                    <span>{getAccountIcon(b.accountType, b.accountName)}</span>
                    <span>{b.accountName}</span>
                    {b.accountCurrency && b.accountCurrency !== "TWD" && (
                      <span style={{ color: "#38bdf8", fontWeight: 600, fontSize: 9.5 }}>
                        [{b.accountCurrency}]
                      </span>
                    )}
                  </span>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10.5 }}>
                    未指定付款
                  </span>
                )}
              </div>
            </td>
            <td style={{ padding: "8px 4px", fontSize: 11 }}>
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "#a5b4fc",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                每月預算
              </span>
            </td>
            <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>
              <div style={{ fontWeight: 700, color: "var(--fg)" }}>
                ${annual.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "#a5b4fc", fontWeight: 500 }}>
                ${baseMonthly.toLocaleString()}/月
              </div>
            </td>

            {/* Cumulative Actual vs Budget Variance Column */}
            {(() => {
              const spentVal = Number(b.spentAmountMinor) / 100;
              const recordedPastMonthsCount = b.months.filter(
                (m) => (m.month < currentMonthIdx && Number(m.actualMinor) > 0) ||
                       (m.month === currentMonthIdx && Number(m.actualMinor) > 0)
              ).length;
              const expectedSoFar = Math.round(baseMonthly * recordedPastMonthsCount);
              const diff = spentVal - expectedSoFar;

              return (
                <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>
                  <div style={{ fontWeight: 600, color: spentVal > 0 ? "#60a5fa" : "var(--muted)" }}>
                    ${spentVal.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>
                    {recordedPastMonthsCount === 0 && spentVal === 0 ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : diff < 0 ? (
                      <span style={{ color: "#34d399" }} title={`已記帳期數共 ${recordedPastMonthsCount} 期預算 $${expectedSoFar.toLocaleString()}，實際累計扣款 $${spentVal.toLocaleString()}，累計省下 $${Math.abs(diff).toLocaleString()}`}>
                        +{Math.abs(diff).toLocaleString()} 結餘
                      </span>
                    ) : diff > 0 ? (
                      <span style={{ color: "#f87171" }} title={`已記帳期數共 ${recordedPastMonthsCount} 期預算 $${expectedSoFar.toLocaleString()}，實際累計扣款 $${spentVal.toLocaleString()}，累計超支 $${diff.toLocaleString()}`}>
                        -{diff.toLocaleString()} 超支
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>±0 持平</span>
                    )}
                  </div>
                </td>
              );
            })()}

            {/* Month columns */}
            {b.months.map((m) => {
              const isActual = m.isActual;
              const val = Math.ceil(Number(m.effectiveMinor) / 100);
              const actualVal = Math.ceil(Number(m.actualMinor) / 100);
              const isPast = m.month < currentMonthIdx;

              // Past month with no transaction record: don't count it (show dash)
              if (isPast && actualVal === 0) {
                return (
                  <td
                    key={m.month}
                    style={{
                      padding: "6px 2px",
                      fontFamily: "monospace",
                      color: "var(--muted)",
                      opacity: 0.3,
                    }}
                    title={`${m.month}月已過去，未有記帳支出記錄（不計入差額）`}
                  >
                    —
                  </td>
                );
              }

              if (isActual && val > 0) {
                const isUnpaidCredit = m.hasUnpaidCredit || m.isPaid === false;
                const diffMonth = Math.round(val - baseMonthly);

                return (
                  <td
                    key={m.month}
                    onClick={async () => {
                      if (!m.transactionId || !onTogglePaid) return;
                      const actionText = isUnpaidCredit ? "標記為已付清" : "還原為待扣繳";
                      const msg = isUnpaidCredit
                        ? `此筆信用卡款項「${b.name}」（$${val.toLocaleString()}${m.txDateNote ? `，${m.txDateNote}` : ""}）是否已隨帳單自銀行帳戶扣繳付清？`
                        : `是否將「${b.name}」（$${val.toLocaleString()}）還原為待扣繳狀態？`;
                      const confirmed = await niceConfirm(
                        `${actionText}確認`,
                        msg
                      );
                      if (confirmed) {
                        onTogglePaid(m.transactionId, !isUnpaidCredit);
                      }
                    }}
                    style={{
                      padding: "4px 2px",
                      fontFamily: "monospace",
                      background: m.month === currentMonthIdx ? "rgba(99, 102, 241, 0.07)" : undefined,
                      cursor: m.transactionId && onTogglePaid ? "pointer" : "default",
                      textAlign: "center",
                    }}
                    title={
                      isUnpaidCredit
                        ? `💳 信用卡已出帳待繳 $${val.toLocaleString()}${m.txDateNote ? ` (${m.txDateNote})` : ""} · 尚未自銀行扣款付清 (點擊可標記為已繳款)`
                        : `✓ 已扣款付清 $${val.toLocaleString()}${m.txDateNote ? ` (${m.txDateNote})` : ""} (預算 $${Math.round(baseMonthly).toLocaleString()}，${
                            diffMonth > 0 ? `多花 $${diffMonth.toLocaleString()}` : diffMonth < 0 ? `省下 $${Math.abs(diffMonth).toLocaleString()}` : "符合預算"
                          })`
                    }
                  >
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                        color: isUnpaidCredit ? "#fb923c" : "#34d399",
                        fontWeight: 700,
                        fontSize: 11.5,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{isUnpaidCredit ? "💳" : "✓"}</span>
                      <span>${val.toLocaleString()}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: isUnpaidCredit ? "#fb923c" : "var(--muted)",
                        opacity: isUnpaidCredit ? 0.95 : 0.8,
                        marginTop: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isUnpaidCredit ? "待繳" : "已付"}{m.txDateNote ? `·${m.txDateNote}` : ""}
                    </div>
                  </td>
                );
              }

              return (
                <td
                  key={m.month}
                  style={{
                    padding: "4px 2px",
                    fontFamily: "monospace",
                    background: m.month === currentMonthIdx ? "rgba(99, 102, 241, 0.07)" : undefined,
                    color: val > 0 ? "#fbbf24" : "var(--muted)",
                    fontWeight: val > 0 ? 600 : 400,
                    textAlign: "center",
                  }}
                  title={val > 0 ? `預估額度 $${val.toLocaleString()}` : `當月預算 $${Math.round(baseMonthly).toLocaleString()}，實際支出 $0`}
                >
                  <div style={{ fontSize: 11.5 }}>{val > 0 ? `$${val.toLocaleString()}` : "$0"}</div>
                  {val > 0 && (
                    <div
                      style={{
                        fontSize: 9,
                        color: "rgba(251, 191, 36, 0.75)",
                        marginTop: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      預估
                    </div>
                  )}
                </td>
              );
            })}

            <td style={{ padding: "6px 4px", textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={idx === 0}
                  onClick={() => onMove(b.id, "rolling", "up")}
                  style={{
                    fontSize: 10,
                    padding: "2px 4px",
                    minWidth: 20,
                    height: 22,
                    opacity: idx === 0 ? 0.2 : 0.85,
                    cursor: idx === 0 ? "default" : "pointer",
                    lineHeight: 1,
                  }}
                  title="往上移動順序"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={idx === rollingItems.length - 1}
                  onClick={() => onMove(b.id, "rolling", "down")}
                  style={{
                    fontSize: 10,
                    padding: "2px 4px",
                    minWidth: 20,
                    height: 22,
                    opacity: idx === rollingItems.length - 1 ? 0.2 : 0.85,
                    cursor: idx === rollingItems.length - 1 ? "default" : "pointer",
                    lineHeight: 1,
                  }}
                  title="往下移動順序"
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{
                    fontSize: 11,
                    padding: "2px 5px",
                    height: 22,
                    color: "#38bdf8",
                    background: "rgba(56, 189, 248, 0.1)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                    fontWeight: 600,
                  }}
                  onClick={() => onOpenBillModal(b)}
                  title="登錄與檢視此項目的帳單明細（支援按日跨月均攤）"
                >
                  🧾 帳單
                </button>
                {onStartEdit && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "2px 5px", height: 22 }}
                    onClick={() => onStartEdit(b)}
                    title="調整此項目之預算額度"
                  >
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "2px 5px", height: 22, color: "var(--expense)" }}
                    onClick={async () => {
                      const ok = await niceConfirm(
                        "刪除預算項目",
                        `確定要刪除「${b.name}」這項預算項目嗎？此操作無法復原。`,
                        "danger"
                      );
                      if (ok) {
                        await onDelete(b.id);
                      }
                    }}
                    title="刪除此項目"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
