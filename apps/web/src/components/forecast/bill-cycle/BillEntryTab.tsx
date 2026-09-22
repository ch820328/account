import React from "react";
import { AmountInput } from "@/components/AmountInput";
import { AccountOptions } from "@/components/AccountOptions";

interface BillEntryTabProps {
  editingBillId: string | null;
  amount: string;
  setAmount: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  paidAt: string;
  setPaidAt: (v: string) => void;
  accountId: string;
  setAccountId: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  attachmentFile: File | null;
  setAttachmentFile: (f: File | null) => void;
  formError: string | null;
  nextStartDate: string | null;
  latestEndDate: string | null;
  liveProration: {
    totalDays: number;
    dailyRate: string;
    monthlyList: Array<{ month: number; days: number; amount: number }>;
  } | null;
  accounts: React.ComponentProps<typeof AccountOptions>["accounts"];
  isPending: boolean;
  amountRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onResetForm: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onSetQuickCycle: (sm: number, em: number) => void;
  onAddMonthsToEndDate: (baseStart: string, monthsToAdd: number) => void;
}

export function BillEntryTab({
  editingBillId,
  amount,
  setAmount,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  paidAt,
  setPaidAt,
  accountId,
  setAccountId,
  note,
  setNote,
  attachmentFile,
  setAttachmentFile,
  formError,
  nextStartDate,
  latestEndDate,
  liveProration,
  accounts,
  isPending,
  amountRef,
  fileInputRef,
  onResetForm,
  onSubmit,
  onSetQuickCycle,
  onAddMonthsToEndDate,
}: BillEntryTabProps) {
  return (
    <form onSubmit={onSubmit}>
      {editingBillId && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: 6,
            fontSize: 12,
            color: "#fde68a",
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>正在編輯已登記之帳單記錄</span>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 11, padding: "2px 6px" }}
            onClick={onResetForm}
          >
            取消編輯 (改為新登錄)
          </button>
        </div>
      )}

      {/* Amount Input */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
          帳單繳費金額 (NT$) *
        </label>
        <AmountInput
          ref={amountRef}
          required
          value={amount}
          onChange={setAmount}
          placeholder="請輸入本次帳單繳費金額，例如 5000"
          style={{ fontSize: 18, padding: "10px 14px", fontWeight: 700 }}
        />
      </div>

      {/* Billing Cycle Period (起始日 ~ 結束日) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>
            計費區間 (帳單涵蓋日期) *
          </label>
          {/* Quick cycle buttons */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {nextStartDate && (
              <>
                <button
                  type="button"
                  className="btn ghost"
                  style={{
                    fontSize: 10.5,
                    padding: "2px 6px",
                    height: 22,
                    color: "#38bdf8",
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setStartDate(nextStartDate);
                    onAddMonthsToEndDate(nextStartDate, 2);
                  }}
                  title={`從 ${nextStartDate} 延續 2 個月雙月期`}
                >
                  ⚡ 延續雙月 (+2月)
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  style={{
                    fontSize: 10.5,
                    padding: "2px 6px",
                    height: 22,
                    color: "#38bdf8",
                    background: "rgba(56, 189, 248, 0.12)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setStartDate(nextStartDate);
                    onAddMonthsToEndDate(nextStartDate, 1);
                  }}
                  title={`從 ${nextStartDate} 延續 1 個月`}
                >
                  ⚡ 延續單月 (+1月)
                </button>
              </>
            )}
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(1, 2)}
            >
              1~2月
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(3, 4)}
            >
              3~4月
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(5, 6)}
            >
              5~6月
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(7, 8)}
            >
              7~8月
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(9, 10)}
            >
              9~10月
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 10.5, padding: "2px 6px", height: 22 }}
              onClick={() => onSetQuickCycle(11, 12)}
            >
              11~12月
            </button>
          </div>
        </div>

        {/* Auto-fill hint banner */}
        {latestEndDate && nextStartDate && !editingBillId && (
          <div
            style={{
              fontSize: 11.5,
              color: "#38bdf8",
              padding: "5px 10px",
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.22)",
              borderRadius: 6,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>
              ✨ 已自動帶入上一期結束日（{latestEndDate}）之次日：<strong>{nextStartDate}</strong> 作為起點
            </span>
            <span style={{ fontSize: 10.5, opacity: 0.85 }}>
              無需重複輸入，接續填寫結束日即可！
            </span>
          </div>
        )}

        <div className="grid cols-2" style={{ gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>
              計費起始日
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px" }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>
              計費結束日
            </label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px" }}
            />
          </div>
        </div>
      </div>

      {/* LIVE PRORATION PREVIEW CARD */}
      {liveProration && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
              <span>📊 即時跨月平攤試算</span>
              <span style={{ fontSize: 11, fontWeight: "normal", color: "var(--muted)" }}>
                （共 {liveProration.totalDays} 天 · 每日平均 ${liveProration.dailyRate}）
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#a7f3d0", fontWeight: 600 }}>
              合計 ${parseFloat(amount || "0").toLocaleString()}
            </div>
          </div>

          {/* Monthly breakdown chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {liveProration.monthlyList.map((m) => (
              <div
                key={m.month}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  fontSize: 11.5,
                  fontFamily: "monospace",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 10 }}>
                  {m.month} 月 ({m.days}天)
                </div>
                <div style={{ fontWeight: 700, color: "#60a5fa", marginTop: 2 }}>
                  ${m.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Date & Account */}
      <div className="grid cols-2" style={{ gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            繳款/扣款日期 *
          </label>
          <input
            type="date"
            required
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            扣款帳戶 *
          </label>
          <select
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={{ width: "100%", padding: "8px 10px" }}
          >
            <option value="">選擇扣款帳戶</option>
            <AccountOptions accounts={accounts} />
          </select>
        </div>
      </div>

      {/* Transaction Note */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
          帳單備註 (選填)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="例如：冷氣夏季電費、第3期水費等"
          style={{ width: "100%", padding: "8px 10px" }}
        />
      </div>

      {/* FILE ATTACHMENT COMPONENT */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}>
          附加帳單單據或發票 (選填)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          style={{ display: "none" }}
          onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
        />

        {!attachmentFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "12px 14px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.16)",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, color: "#a5b4fc" }}>📎</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "#e2e8f0" }}>
                  上傳帳單電子檔或拍照照片
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  支援 PDF、JPG、PNG 檔案
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(99, 102, 241, 0.15)",
                color: "#a5b4fc",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                fontWeight: 600,
              }}
            >
              瀏覽檔案
            </span>
          </div>
        ) : (
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ fontSize: 15 }}>📄</span>
              <div style={{ overflow: "hidden" }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#f1f5f9",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 320,
                  }}
                  title={attachmentFile.name}
                >
                  {attachmentFile.name}
                </div>
                <div style={{ fontSize: 10.5, color: "#a5b4fc" }}>
                  {(attachmentFile.size / 1024).toFixed(0)} KB
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setAttachmentFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                cursor: "pointer",
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
              }}
              title="移除檔案"
            >
              ✕ 移除
            </button>
          </div>
        )}
      </div>

      {formError && (
        <div style={{ color: "var(--expense)", fontSize: 12.5, marginBottom: 14 }}>
          ⚠️ {formError}
        </div>
      )}

      {/* Form Action Buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {editingBillId && (
          <button type="button" className="btn ghost" onClick={onResetForm}>
            放棄修改
          </button>
        )}
        <button
          type="submit"
          className="btn"
          disabled={isPending || !amount || !startDate || !endDate}
          style={{ minWidth: 130, fontWeight: 700 }}
        >
          {isPending
            ? "儲存中…"
            : editingBillId
            ? "儲存修改"
            : "確認登記帳單"}
        </button>
      </div>
    </form>
  );
}
