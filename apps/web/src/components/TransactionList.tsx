"use client";

import { AmountInput } from "@/components/AmountInput";
import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import { fmtDate } from "@/lib/format";
import { isAutoTransaction, transactionSourceLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { ZeroState } from "@/components/ZeroState";
import { AccountOptions } from "@/components/AccountOptions";
import { CategoryOptions } from "@/components/CategoryOptions";
import { useState } from "react";
import { niceConfirm } from "@/lib/confirm";

import { getCategoryFullName } from "@/lib/categories";

export type TransactionRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  note: string | null;
  source?: string | null;
  accountId: string;
  accountName: string;
  transferAccountId?: string | null;
  transferAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isPaid?: boolean;
  statementMonth?: string | null;
  attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[];
};

function toDateInput(d: Date): string {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function TransactionItem({
  t,
  accounts,
  categories,
  editing,
  onStartEdit,
  onCancelEdit,
  invalidate,
}: {
  t: TransactionRow;
  accounts: any[];
  categories: any[];
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  invalidate: () => Promise<unknown>;
}) {
  const auto = isAutoTransaction(t.source);
  const sourceLabel = transactionSourceLabel(t.source);

  const [amount, setAmount] = useState(String(Number(t.amountMinor) / 100));
  const [accountId, setAccountId] = useState(t.accountId);
  const [transferAccountId, setTransferAccountId] = useState(t.transferAccountId ?? "");
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [occurredAt, setOccurredAt] = useState(toDateInput(t.occurredAt));
  const [statementMonth, setStatementMonth] = useState(t.statementMonth ?? "");
  const [note, setNote] = useState(t.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const update = trpc.transactions.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      onCancelEdit();
    },
    onError: (e) => setError(e.message),
  });
  const remove = trpc.transactions.delete.useMutation({
    onSuccess: () => invalidate(),
  });
  const setPaid = trpc.transactions.setPaid.useMutation({
    onSuccess: () => invalidate(),
  });
  const deleteAttachment = trpc.attachments.delete.useMutation({
    onSuccess: () => invalidate(),
  });

  return (
    <div className={`ff3-card ff3-tx-row${editing ? " editing" : ""}`} style={{ marginBottom: 8, padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 12 }}>
        <div
          style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}
          onClick={() => (editing ? onCancelEdit() : onStartEdit())}
          title="點擊展開編輯"
        >
          {/* Firefly Flow Pills */}
          <div className="ff3-tx-flow">
            <span className="ff3-acc-pill">🏦 {t.accountName}</span>
            <span className="ff3-arrow">➔</span>
            {t.type === "transfer" ? (
              <span className="ff3-acc-pill">🏦 {t.transferAccountName ?? "目標帳戶"}</span>
            ) : (() => {
              const fullName = getCategoryFullName(t.categoryId, categories);
              const isUncat = !t.categoryId || fullName === "未分類";
              return (
                <span
                  className="ff3-badge"
                  style={
                    isUncat
                      ? {
                          border: "1.5px solid #ef4444",
                          background: "rgba(239, 68, 68, 0.16)",
                          color: "#fca5a5",
                          boxShadow: "0 0 6px rgba(239, 68, 68, 0.25)",
                          fontWeight: 700,
                        }
                      : undefined
                  }
                >
                  🏷️ {isUncat ? "未分類" : fullName}
                </span>
              );
            })()}
            {sourceLabel && <span className="ff3-badge" style={{ background: "rgba(255,255,255,0.08)", color: "var(--muted)" }}>{sourceLabel}</span>}
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>📅 {fmtDate(t.occurredAt)}</span>
            {t.note && <span>• {t.note}</span>}
            {t.attachments && t.attachments.length > 0 && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginLeft: 4 }}>
                {t.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/attachments/${att.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: 11,
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                    title={`預覽附件: ${att.filename} (${(att.sizeBytes / 1024).toFixed(0)} KB)`}
                  >
                    📎 {att.filename}
                  </a>
                ))}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>
            <Amount
              value={t.amountMinor}
              currency={t.currency}
              kind={t.type === "expense" ? "expense" : t.type === "income" ? "income" : "neutral"}
              signed={t.type !== "transfer"}
            />
          </div>

          {(() => {
            const currentAccount = accounts?.find((a) => a.id === t.accountId);
            const isCreditCard = currentAccount ? currentAccount.type === "credit" : (t as any).accountType === "credit";

            if (!isCreditCard) {
              return (
                <span style={{ fontSize: 11, padding: "3px 8px", background: "rgba(53, 196, 141, 0.12)", color: "var(--income)", borderRadius: 4, whiteSpace: "nowrap" }}>
                  ✅ 已扣款
                </span>
              );
            }

            const monthLabel = t.statementMonth
              ? `${t.statementMonth.slice(5)}月帳單`
              : "帳單待入";

            return (
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "#a5b4fc",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                }}
                title={t.statementMonth ? `${t.statementMonth} 期帳單` : "依結帳日自動計算"}
              >
                💳 {monthLabel}
              </span>
            );
          })()}

          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 12, padding: "4px 8px" }}
            onClick={() => (editing ? onCancelEdit() : onStartEdit())}
          >
            {editing ? "收合" : "編輯"}
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ fontSize: 12, padding: "4px 8px", color: "var(--expense)" }}
            onClick={async () => {
              const ok = await niceConfirm("刪除交易", "確定要刪除這筆交易嗎？", "danger");
              if (ok) remove.mutate({ id: t.id });
            }}
          >
            刪除
          </button>
        </div>
      </div>

      {editing && (
        <div className="row-edit-panel">
          {auto && (
            <div className="muted" style={{ fontSize: 12 }}>
              此筆由「{sourceLabel}」排程自動產生，修改僅影響這一筆，不會改動排程本身。
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const selectedAcc = accounts?.find((a) => a.id === accountId);
              const isCredit = selectedAcc ? selectedAcc.type === "credit" : false;
              update.mutate({
                id: t.id,
                amount,
                accountId,
                transferAccountId: t.type === "transfer" ? (transferAccountId || null) : undefined,
                categoryId: t.type === "transfer" ? undefined : categoryId || null,
                occurredAt: new Date(`${occurredAt}T00:00:00`),
                note: note || null,
                statementMonth: isCredit ? (statementMonth || null) : null,
              });
            }}
          >
            <div className="grid cols-3">
              <label>
                金額
                <AmountInput
                  required
                  value={amount}
                  onChange={setAmount}
                />
              </label>
              <label>
                扣款帳戶
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <AccountOptions accounts={accounts} />
                </select>
              </label>
              {t.type === "transfer" ? (
                <label>
                  轉入帳戶
                  <select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)}>
                    <AccountOptions accounts={accounts} includeOther />
                  </select>
                </label>
              ) : (
                <label>
                  分類
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <CategoryOptions categories={categories} kind={t.type} />
                  </select>
                </label>
              )}
              <label>
                日期
                <input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </label>
              {(() => {
                const acc = accounts?.find((a) => a.id === accountId);
                if (acc?.type !== "credit") return null;
                const bDay = acc.billingDay ?? 10;
                const dt = new Date(`${occurredAt}T12:00:00`);
                const y = dt.getFullYear();
                const m = dt.getMonth();
                const d = dt.getDate();
                const defDate = d <= bDay ? new Date(y, m, 1) : new Date(y, m + 1, 1);
                const prev = new Date(defDate.getFullYear(), defDate.getMonth() - 1, 1);
                const next = new Date(defDate.getFullYear(), defDate.getMonth() + 1, 1);
                const fmtKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
                const opts = [
                  { key: fmtKey(prev), label: `${prev.getFullYear()}年${prev.getMonth() + 1}月帳單` },
                  { key: fmtKey(defDate), label: `${defDate.getFullYear()}年${defDate.getMonth() + 1}月帳單 (推薦)` },
                  { key: fmtKey(next), label: `${next.getFullYear()}年${next.getMonth() + 1}月帳單` },
                ];
                return (
                  <label>
                    帳單期數 (入帳月)
                    <select
                      value={statementMonth || fmtKey(defDate)}
                      onChange={(e) => setStatementMonth(e.target.value)}
                    >
                      {opts.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })()}
            </div>
            <label>
              備註
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
            </label>

            {/* Attachments management */}
            <div style={{ marginTop: 12, marginBottom: 16, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px dashed var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--fg)", display: "flex", alignItems: "center", gap: 6 }}>
                📎 單據 / PDF 附件
              </div>

              {t.attachments && t.attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {t.attachments.map((att) => (
                    <div key={att.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
                      <a
                        href={`/api/attachments/${att.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
                        title="點擊在新分頁開啟"
                      >
                        📄 {att.filename} <span style={{ color: "var(--muted)", fontSize: 11 }}>({(att.sizeBytes / 1024).toFixed(1)} KB)</span>
                      </a>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ fontSize: 11, padding: "2px 8px", color: "var(--expense)" }}
                        disabled={deleteAttachment.isPending}
                        onClick={async () => {
                          const ok = await niceConfirm("移除附件", `確定要移除「${att.filename}」嗎？`, "danger");
                          if (ok) {
                            await deleteAttachment.mutateAsync({ id: att.id });
                          }
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>目前無附帶單據</div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, margin: 0, fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>
                  <span>＋ 上傳單據或 PDF</span>
                  <input
                    type="file"
                    style={{ display: "none" }}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      setUploadError(null);
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        formData.append("transactionId", t.id);
                        const res = await fetch("/api/attachments", {
                          method: "POST",
                          body: formData,
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.error || "上傳失敗");
                        }
                        await invalidate();
                      } catch (err: any) {
                        setUploadError(err.message || "上傳失敗");
                      } finally {
                        setUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
                {uploading && <span style={{ fontSize: 12, color: "var(--muted)" }}>上傳中…</span>}
                {uploadError && <span style={{ fontSize: 12, color: "var(--expense)" }}>{uploadError}</span>}
              </div>
            </div>

            {error && <div className="error">{error}</div>}
            <div className="row-inline">
              <button className="btn" type="submit" disabled={update.isPending}>
                {update.isPending ? "儲存中…" : "儲存"}
              </button>
              <button type="button" className="btn ghost" onClick={onCancelEdit}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function TransactionList({
  data,
  loading,
  accounts: accountsProp,
  categories: categoriesProp,
  invalidate,
}: {
  data: TransactionRow[] | undefined;
  loading: boolean;
  accounts?: any[];
  categories?: any[];
  invalidate: () => Promise<unknown>;
}) {
  const accountsQuery = trpc.accounts.list.useQuery(undefined, { enabled: !accountsProp });
  const categoriesQuery = trpc.categories.list.useQuery(undefined, { enabled: !categoriesProp });
  const accounts = accountsProp || accountsQuery.data || [];
  const categories = categoriesProp || categoriesQuery.data || [];
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows: TransactionRow[] = Array.isArray(data) ? data : (data as any)?.items || [];

  if (loading) return <SkeletonList rows={5} />;
  if (!rows || rows.length === 0) {
    return (
      <ZeroState
        icon="💸"
        title="尚無交易紀錄"
        description="您可以透過快速記帳新增第一筆收支，或是調整篩選條件。"
        actionText="去記錄"
        actionHref="/entry"
      />
    );
  }

  return (
    <div className="list">
      {rows.map((t) => (
        <TransactionItem
          key={t.id}
          t={t}
          accounts={Array.isArray(accounts) ? accounts : (accounts as any)?.data ?? []}
          categories={Array.isArray(categories) ? categories : (categories as any)?.data ?? []}
          editing={editingId === t.id}
          onStartEdit={() => setEditingId(t.id)}
          onCancelEdit={() => setEditingId(null)}
          invalidate={invalidate}
        />
      ))}
    </div>
  );
}
