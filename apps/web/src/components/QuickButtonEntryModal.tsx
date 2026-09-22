"use client";

import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { AccountOptions } from "@/components/AccountOptions";
import { CategoryOptions } from "@/components/CategoryOptions";
import { AmountInput } from "@/components/AmountInput";
import { todayIso } from "@/lib/labels";

export type QuickButtonData = {
  id: string;
  name: string;
  icon?: string | null;
  type: "expense" | "income" | "transfer";
  categoryId?: string | null;
  categoryName?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  defaultAmountMinor?: bigint | null;
  matchPattern?: string | null;
};

export function QuickButtonEntryModal({
  button,
  onClose,
  onSuccess,
}: {
  button: QuickButtonData | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery();
  const categoriesQuery = trpc.categories.list.useQuery();

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (button) {
      setNote(button.name);
      setType(button.type);
      setCategoryId(button.categoryId || "");
      setDate(todayIso());
      setAttachmentFile(null);
      setError(null);

      if (button.defaultAmountMinor) {
        setAmount(String(Number(button.defaultAmountMinor) / 100));
      } else {
        setAmount("");
      }

      // Default account
      if (button.accountId) {
        setAccountId(button.accountId);
      } else if (accountsQuery.data && accountsQuery.data.length > 0) {
        const defaultAcc = accountsQuery.data.find((a) => a.type === "bank" || a.type === "wallet");
        setAccountId(defaultAcc ? defaultAcc.id : accountsQuery.data[0]!.id);
      }

      // Auto-focus amount input
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 100);
    }
  }, [button, accountsQuery.data]);

  const createTx = trpc.transactions.create.useMutation({
    onSuccess: async (created) => {
      // Upload attachment if selected
      if (attachmentFile && created?.id) {
        try {
          const formData = new FormData();
          formData.append("file", attachmentFile);
          formData.append("transactionId", created.id);
          await fetch("/api/attachments", {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          console.warn("Attachment upload failed:", err);
        }
      }

      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.quickButtons.list.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.netWorth.summary.invalidate(),
        utils.transactions.monthlyBreakdown?.invalidate(),
      ]);

      onSuccess();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  if (!button) return null;

  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ff3-card"
        style={{
          width: "clamp(500px, 50vw, 900px)",
          maxWidth: "95vw",
          background: "var(--bg)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>{button.icon || "⚡"}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                快速記帳：{button.name}
              </h3>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                已自動帶入您設定的分類與名稱，請輸入當期金額完成記錄。
              </div>
            </div>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} style={{ fontSize: 18, padding: "4px 8px" }}>
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!amount || !accountId) return;

            createTx.mutate({
              type,
              amount,
              accountId,
              categoryId: categoryId || undefined,
              occurredAt: new Date(`${date}T00:00:00`),
              note: note || button.name,
            });
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              當期繳費金額 (NT$) *
            </label>
            <AmountInput
              ref={amountRef}
              required
              value={amount}
              onChange={setAmount}
              placeholder="請輸入本次繳費單金額"
              style={{ fontSize: 18, padding: "10px 14px", fontWeight: 700 }}
            />
          </div>

          <div className="grid cols-2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                繳款日期
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                <option value="">選擇帳戶</option>
                <AccountOptions accounts={accounts} />
              </select>
            </div>
          </div>

          <div className="grid cols-2" style={{ gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                分類
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px" }}
              >
                <option value="">(未指定分類)</option>
                <CategoryOptions categories={categories} kind={type} />
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                交易備註
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="選填"
                style={{ width: "100%", padding: "8px 10px" }}
              />
            </div>
          </div>

          {/* Optional PDF / Bill file attachment - Sleek modern UI */}
          <div style={{ marginBottom: 16 }}>
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
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px dashed rgba(255, 255, 255, 0.18)",
                  borderRadius: 8,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#6366f1";
                  e.currentTarget.style.background = "rgba(99, 102, 241, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.18)";
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, color: "#a5b4fc" }}>📎</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "#e2e8f0" }}>
                      附加瓦斯/水電帳單或明細 (選填)
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
                  選擇檔案
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
                        maxWidth: 280,
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

          {error && <div style={{ color: "var(--expense)", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn"
              disabled={createTx.isPending || !amount || !accountId}
              style={{ minWidth: 110, fontWeight: 600 }}
            >
              {createTx.isPending ? "儲存中…" : "確認記帳"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
