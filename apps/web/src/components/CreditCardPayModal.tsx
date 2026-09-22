"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AmountInput } from "@/components/AmountInput";
import { Amount } from "@/components/Amount";

type Account = {
  id?: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor?: bigint;
};

type CreditCardPayModalProps = {
  isOpen: boolean;
  creditCardAccount?: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
};

export function CreditCardPayModal({
  isOpen,
  creditCardAccount,
  accounts,
  onClose,
  onSuccess,
}: CreditCardPayModalProps) {
  const assetAccounts = accounts.filter(
    (a) => ["bank", "cash", "wallet"].includes(a.type)
  );

  const initialFromAccId = assetAccounts[0]?.id || "";
  const unpaidBalance = creditCardAccount ? Math.abs(Number(creditCardAccount.balanceMinor ?? 0n) / 100) : 0;

  const [fromAccountId, setFromAccountId] = useState(initialFromAccId);
  const [amount, setAmount] = useState(String(unpaidBalance));
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [note, setNote] = useState("結清信用卡帳單");
  const [error, setError] = useState<string | null>(null);

  const createTransfer = trpc.transactions.create.useMutation({
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  if (!isOpen || !creditCardAccount) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="ff3-card" style={{ width: "clamp(480px, 50vw, 850px)", maxWidth: "95vw", margin: "auto", border: "1px solid var(--accent)", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8, color: "var(--text)" }}>
            💳 結清信用卡帳單 — {creditCardAccount.name}
          </h3>
          <button type="button" className="btn ghost" style={{ fontSize: 14, padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 16, background: "rgba(255,107,107,0.1)", padding: 12, borderRadius: 8, fontSize: 13 }}>
          <div>當前累計未結算卡費：<strong style={{ color: "var(--expense)" }}><Amount value={creditCardAccount.balanceMinor ?? 0n} currency={creditCardAccount.currency} /></strong></div>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!fromAccountId) {
            setError("請選擇付款的銀行/現金帳戶");
            return;
          }
          createTransfer.mutate({
            type: "transfer",
            accountId: fromAccountId,
            transferAccountId: creditCardAccount.id,
            amount,
            occurredAt: new Date(`${occurredAt}T00:00:00`),
            note: note || "結清信用卡帳單",
          });
        }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 13 }}>
            選擇扣款付款帳戶 (付款來源)
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", marginTop: 4 }}
              required
            >
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  🏦 {a.name} (餘額: {Number(a.balanceMinor ?? 0n)/100} {a.currency})
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ flex: 1, fontSize: 13 }}>
              還款金額
              <AmountInput
                required
                value={amount}
                onChange={setAmount}
              />
            </label>
            <label style={{ flex: 1, fontSize: 13 }}>
              扣款日期
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", marginTop: 4 }}
                required
              />
            </label>
          </div>

          <label style={{ fontSize: 13 }}>
            備註說明
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="結清信用卡帳單"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", marginTop: 4 }}
            />
          </label>

          {error && <div style={{ color: "var(--expense)", fontSize: 13 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn" disabled={createTransfer.isPending} style={{ background: "var(--income)", color: "#000", fontWeight: 700 }}>
              {createTransfer.isPending ? "還款處理中…" : "🏦 確認扣款結清卡費"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
