import React from "react";
import type { BudgetItem } from "../types";
import { parseMonthsList, getSmartFrequencyLabel } from "../MonthSelector";
import { getAccountIcon } from "./MatrixTypes";
import { niceConfirm } from "@/lib/confirm";

interface MatrixFixedSectionProps {
  fixedItems: BudgetItem[];
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
  onOpenSettleModal: (item: {
    budgetId: string;
    name: string;
    icon?: string | null;
    month: number;
    amount: string;
    accountId: string;
  }) => void;
  onTogglePaid?: (transactionId: string, willBePaid: boolean) => Promise<void> | void;
}

export function MatrixFixedSection({
  fixedItems,
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
  onOpenSettleModal,
  onTogglePaid,
}: MatrixFixedSectionProps) {
  if (fixedItems.length === 0) return null;

  return (
    <>
      <tr style={{ background: "rgba(245, 158, 11, 0.06)", borderTop: "1px solid rgba(245, 158, 11, 0.2)" }}>
        <td
          colSpan={17}
          style={{
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            color: "#fbbf24",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>📌 固定開銷項目（指定月份扣款）</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "normal" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>快速排序：</span>
              <button
                type="button"
                onClick={() => onAutoSort("fixed_months", "months")}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#fbbf24",
                  cursor: "pointer",
                }}
                title="依最先扣款月份順序排序"
              >
                📅 月份順序
              </button>
              <button
                type="button"
                onClick={() => onAutoSort("fixed_months", "amount")}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#fbbf24",
                  cursor: "pointer",
                }}
                title="依金額由大到小排序"
              >
                💰 金額大小
              </button>
              <button
                type="button"
                onClick={() => onAutoSort("fixed_months", "name")}
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "#fbbf24",
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

      {fixedItems.map((b, idx) => {
        const monthsList = parseMonthsList(b.targetMonths || "");
        const count = monthsList.length;
        const annual = Number(b.annualAmountMinor) / 100;
        const perPeriod = count > 0 ? Math.round(annual / count) : annual;

        return (
          <tr
            key={b.id}
            draggable
            onDragStart={(e) => onDragStart(e, b.id)}
            onDragOver={(e) => onDragOver(e, b.id)}
            onDragLeave={(e) => onDragLeave(e, b.id)}
            onDrop={(e) => onDrop(e, b.id, "fixed_months")}
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              borderTop: dragOverId === b.id ? "2px solid #f59e0b" : undefined,
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
                <span>{b.icon || "📌"}</span>
                <span>{b.name}</span>
                {b.isAutoLoan && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                      color: "#38bdf8",
                      fontWeight: 600,
                    }}
                    title="由【排程中心 ➜ 貸款管理】自動同步試算"
                  >
                    🔗 貸款同步
                  </span>
                )}
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
                    <span style={{ color: "#fbbf24", fontWeight: 600, marginRight: 3 }}>
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
                  background: "rgba(245, 158, 11, 0.12)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {getSmartFrequencyLabel(b.targetMonths || "")}
              </span>
            </td>
            <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>
              <div style={{ fontWeight: 700, color: "var(--fg)" }}>
                ${annual.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 500 }}>
                ${perPeriod.toLocaleString()}/期
              </div>
            </td>

            {/* Cumulative Actual vs Budget Variance Column */}
            {(() => {
              const spentVal = Number(b.spentAmountMinor) / 100;
              const recordedPastTargetsCount = b.months.filter(
                (m) => (monthsList.includes(m.month) || Number(m.actualMinor) > 0) &&
                       ((m.month < currentMonthIdx && Number(m.actualMinor) > 0) ||
                        (m.month === currentMonthIdx && Number(m.actualMinor) > 0))
              ).length;
              const expectedSoFar = Math.round(recordedPastTargetsCount * perPeriod);
              const diff = spentVal - expectedSoFar;

              return (
                <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>
                  <div style={{ fontWeight: 600, color: spentVal > 0 ? "#60a5fa" : "var(--muted)" }}>
                    ${spentVal.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600 }}>
                    {recordedPastTargetsCount === 0 && spentVal === 0 ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : diff < 0 ? (
                      <span style={{ color: "#34d399" }} title={`已對齊期數共 ${recordedPastTargetsCount} 期預算 $${expectedSoFar.toLocaleString()}，實際累計扣款 $${spentVal.toLocaleString()}，累計省下 $${Math.abs(diff).toLocaleString()}`}>
                        +{Math.abs(diff).toLocaleString()} 結餘
                      </span>
                    ) : diff > 0 ? (
                      <span style={{ color: "#f87171" }} title={`已對齊期數共 ${recordedPastTargetsCount} 期預算 $${expectedSoFar.toLocaleString()}，實際累計扣款 $${spentVal.toLocaleString()}，累計超支 $${diff.toLocaleString()}`}>
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
              const actualVal = Math.ceil(Number(m.actualMinor) / 100);
              const isTarget = monthsList.includes(m.month);
              const isPast = m.month < currentMonthIdx;

              if (!isTarget && actualVal === 0) {
                return (
                  <td
                    key={m.month}
                    style={{
                      padding: "6px 2px",
                      fontFamily: "monospace",
                      background: m.month === currentMonthIdx ? "rgba(99, 102, 241, 0.07)" : undefined,
                      textAlign: "center",
                    }}
                  >
                    <span style={{ opacity: 0.25 }}>—</span>
                  </td>
                );
              }

              if (actualVal > 0) {
                const isUnpaidCredit = m.hasUnpaidCredit || m.isPaid === false;
                const diffMonth = Math.round(actualVal - perPeriod);

                return (
                  <td
                    key={m.month}
                    onClick={async () => {
                      if (!m.transactionId || !onTogglePaid) return;
                      const actionText = isUnpaidCredit ? "標記為已付清" : "還原為待扣繳";
                      const msg = isUnpaidCredit
                        ? `此筆信用卡款項「${b.name}」（$${actualVal.toLocaleString()}${m.txDateNote ? `，${m.txDateNote}` : ""}）是否已隨帳單自銀行帳戶扣繳付清？`
                        : `是否將「${b.name}」（$${actualVal.toLocaleString()}）還原為待扣繳狀態？`;
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
                        ? `💳 信用卡已出帳待繳 $${actualVal.toLocaleString()}${m.txDateNote ? ` (${m.txDateNote})` : ""} · 尚未自銀行扣款付清 (點擊可標記為已繳款)`
                        : `✓ 已扣款付清 $${actualVal.toLocaleString()}${m.txDateNote ? ` (${m.txDateNote})` : ""}${isTarget ? ` (預算 $${perPeriod.toLocaleString()}，${diffMonth > 0 ? `多花 $${diffMonth.toLocaleString()}` : diffMonth < 0 ? `省下 $${Math.abs(diffMonth).toLocaleString()}` : "符合預算"})` : ""}`
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
                      <span>${actualVal.toLocaleString()}</span>
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
                  onClick={() => {
                    onOpenSettleModal({
                      budgetId: b.id,
                      name: b.name,
                      icon: b.icon,
                      month: m.month,
                      amount: String(perPeriod),
                      accountId: b.accountId || "",
                    });
                  }}
                  style={{
                    padding: "4px 2px",
                    fontFamily: "monospace",
                    background: m.month === currentMonthIdx ? "rgba(99, 102, 241, 0.07)" : undefined,
                    color: isPast ? "#fde68a" : "#fbbf24",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                  title={`尚未出帳 / 預算預估 $${perPeriod.toLocaleString()} · 點擊以此項目直接扣款入帳 (${m.month}月份)`}
                >
                  <div style={{ fontSize: 11.5 }}>${perPeriod.toLocaleString()}</div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "rgba(251, 191, 36, 0.75)",
                      marginTop: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    未出帳
                  </div>
                </td>
              );
            })}

            <td style={{ padding: "6px 4px", textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={idx === 0}
                  onClick={() => onMove(b.id, "fixed_months", "up")}
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
                  disabled={idx === fixedItems.length - 1}
                  onClick={() => onMove(b.id, "fixed_months", "down")}
                  style={{
                    fontSize: 10,
                    padding: "2px 4px",
                    minWidth: 20,
                    height: 22,
                    opacity: idx === fixedItems.length - 1 ? 0.2 : 0.85,
                    cursor: idx === fixedItems.length - 1 ? "default" : "pointer",
                    lineHeight: 1,
                  }}
                  title="往下移動順序"
                >
                  ▼
                </button>
                {onStartEdit && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "2px 5px", height: 22 }}
                    onClick={() => onStartEdit(b)}
                    title="編輯此項目"
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
                      if (b.isAutoLoan) {
                        await niceConfirm(
                          "無法直接刪除",
                          "此項目由【排程中心 ➜ 貸款管理】自動同步試算。若需停用或修改，請至排程中心管理貸款合約。",
                          "warning"
                        );
                        return;
                      }
                      const ok = await niceConfirm(
                        "刪除固定開銷項目",
                        `確定要刪除「${b.name}」這項固定開銷項目嗎？此操作將移除全年度的排程預估。`,
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
