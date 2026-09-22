import React from "react";
import { BillItem } from "./BillTypes";
import { niceConfirm } from "@/lib/confirm";

interface BillHistoryTabProps {
  isLoading: boolean;
  bills: BillItem[];
  onStartEdit: (bill: BillItem) => void;
  onDelete: (id: string) => void;
  onNewBill: () => void;
}

export function BillHistoryTab({
  isLoading,
  bills,
  onStartEdit,
  onDelete,
  onNewBill,
}: BillHistoryTabProps) {
  if (isLoading) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: "var(--muted)" }}>
        載入帳單記錄中…
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div
        style={{
          padding: "40px 20px",
          textAlign: "center",
          background: "rgba(255, 255, 255, 0.02)",
          borderRadius: 10,
          border: "1px dashed rgba(255, 255, 255, 0.1)",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
          尚未有此項目的帳單記錄
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
          點擊下方按鈕，登記您的第一期水電、瓦斯或定期帳單。
        </div>
        <button
          type="button"
          className="btn"
          onClick={onNewBill}
          style={{ fontSize: 13, padding: "6px 14px" }}
        >
          ➕ 立即登錄第一筆帳單
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          共 {bills.length} 期帳單記錄（按扣款日期排序）：
        </span>
        <button
          type="button"
          className="btn ghost"
          style={{ fontSize: 11.5, padding: "2px 8px" }}
          onClick={onNewBill}
        >
          ➕ 登錄新一期帳單
        </button>
      </div>

      {bills.map((bill) => {
        const billAmt = Number(bill.amountMinor) / 100;

        return (
          <div
            key={bill.id}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              transition: "background 0.15s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>
                    {bill.startDate && bill.endDate ? (
                      <span>
                        📅 {bill.startDate} ~ {bill.endDate}
                      </span>
                    ) : (
                      <span>單期帳單</span>
                    )}
                  </span>
                  {bill.totalDays && (
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "#a5b4fc",
                        fontWeight: 600,
                      }}
                    >
                      共 {bill.totalDays} 天
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    marginTop: 4,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>扣款日：{bill.paidDate}</span>
                  {bill.accountName && <span>扣款帳戶：{bill.accountName}</span>}
                  {bill.note && <span style={{ color: "#cbd5e1" }}>備註：{bill.note}</span>}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#60a5fa",
                    fontFamily: "monospace",
                  }}
                >
                  ${billAmt.toLocaleString()}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    marginTop: 4,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "2px 6px" }}
                    onClick={() => onStartEdit(bill)}
                    title="編輯此帳單"
                  >
                    ✏️ 編輯
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: 11, padding: "2px 6px", color: "var(--expense)" }}
                    onClick={async () => {
                      const ok = await niceConfirm(
                        "刪除帳單",
                        `確定要刪除這筆金額 $${billAmt.toLocaleString()} 的帳單嗎？各月份的平攤額將會同步取消。`,
                        "danger"
                      );
                      if (ok) {
                        onDelete(bill.id);
                      }
                    }}
                    title="刪除此帳單"
                  >
                    🗑️ 刪除
                  </button>
                </div>
              </div>
            </div>

            {/* Proration breakdown badges */}
            {bill.prorations.length > 0 && (
              <div
                style={{
                  padding: "6px 10px",
                  background: "rgba(0, 0, 0, 0.25)",
                  borderRadius: 6,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
              >
                <span style={{ color: "var(--muted)", fontSize: 10, fontWeight: 600 }}>
                  各月均攤：
                </span>
                {bill.prorations.map((p) => (
                  <span
                    key={p.month}
                    style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: "rgba(99, 102, 241, 0.12)",
                      color: "#93c5fd",
                    }}
                  >
                    {p.month}月 ({p.days}天): ${(Math.ceil(Number(p.amountMinor) / 100)).toLocaleString()}
                  </span>
                ))}
              </div>
            )}

            {/* Attachments if present */}
            {bill.attachments.length > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>附件單據：</span>
                {bill.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "#38bdf8",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    📎 {att.filename} ({(att.sizeBytes / 1024).toFixed(0)} KB)
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
