import React from "react";
import { AccountOptions } from "@/components/AccountOptions";

export interface SettleModalItem {
  budgetId: string;
  name: string;
  icon?: string | null;
  month: number;
  amount: string;
  accountId: string;
}

interface MatrixSettleModalProps {
  targetYear: number;
  settleModalItem: SettleModalItem;
  accounts: React.ComponentProps<typeof AccountOptions>["accounts"];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (item: SettleModalItem) => void;
  onChange: (updated: SettleModalItem) => void;
}

export function MatrixSettleModal({
  targetYear,
  settleModalItem,
  accounts,
  isPending,
  onClose,
  onConfirm,
  onChange,
}: MatrixSettleModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(480px, 50vw, 850px)",
          maxWidth: "95vw",
          background: "#19222d",
          border: "1px solid var(--accent)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            borderBottom: "1px solid var(--border)",
            paddingBottom: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{settleModalItem.icon || "📌"}</span>
            <span>直接扣款入帳：{settleModalItem.name}</span>
          </h3>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(settleModalItem);
          }}
        >
          <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: "rgba(99,102,241,0.1)", color: "#a5b4fc", fontSize: 12 }}>
            預算歸屬：<strong>{targetYear} 年 {settleModalItem.month} 月份</strong>。確認後系統將自動生成真實交易紀錄並扣減帳戶餘額。
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
              實付金額 (NT$) *
            </label>
            <input
              type="number"
              step="any"
              required
              value={settleModalItem.amount}
              onChange={(e) =>
                onChange({ ...settleModalItem, amount: e.target.value })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontSize: 15,
                fontWeight: 700,
              }}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
              扣款帳戶 (銀行活存、信用卡或現金) *
            </label>
            <select
              value={settleModalItem.accountId}
              onChange={(e) =>
                onChange({ ...settleModalItem, accountId: e.target.value })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontSize: 14,
              }}
            >
              <AccountOptions accounts={accounts} />
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn"
              disabled={isPending}
              style={{
                background: "var(--income)",
                color: "#000",
                fontWeight: 700,
              }}
            >
              {isPending ? "入帳中..." : "確定扣款入帳"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
