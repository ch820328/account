"use client";

import { Amount } from "@/components/Amount";
import { SkeletonList } from "@/components/Skeleton";
import { fmtDate } from "@/lib/format";
import { isAutoTransaction, transactionSourceLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useState } from "react";

export type TransactionRow = {
  id: string;
  type: "income" | "expense" | "transfer";
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  note: string | null;
  source?: string | null;
  accountName: string;
  transferAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
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
  categories,
  editing,
  onStartEdit,
  onCancelEdit,
  invalidate,
}: {
  t: TransactionRow;
  categories: { id: string; name: string; kind: string }[];
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  invalidate: () => Promise<unknown>;
}) {
  const auto = isAutoTransaction(t.source);
  const sourceLabel = transactionSourceLabel(t.source);

  const [amount, setAmount] = useState(String(Number(t.amountMinor) / 100));
  const [categoryId, setCategoryId] = useState(t.categoryId ?? "");
  const [occurredAt, setOccurredAt] = useState(toDateInput(t.occurredAt));
  const [note, setNote] = useState(t.note ?? "");
  const [error, setError] = useState<string | null>(null);

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

  const catOptions = categories.filter((c) =>
    t.type === "income" ? c.kind === "income" : c.kind === "expense",
  );

  return (
    <div className={`list-item${editing ? " editing" : ""}`}>
      <div className="row">
        <div
          className="meta"
          style={{ cursor: "pointer" }}
          onClick={() => (editing ? onCancelEdit() : onStartEdit())}
          title="點一下編輯"
        >
          <span className="primary">
            {t.type === "transfer"
              ? "轉帳"
              : (t.categoryName ?? (t.type === "income" ? "收入" : "支出"))}
            {sourceLabel && <span className="badge muted-badge">{sourceLabel}</span>}
          </span>
          <span className="secondary">
            {t.type === "transfer"
              ? `${t.accountName} → ${t.transferAccountName ?? "?"}`
              : t.accountName}{" "}
            · {fmtDate(t.occurredAt)}
            {t.note ? ` · ${t.note}` : ""}
          </span>
        </div>
        <div className="row-inline">
          <Amount
            value={t.amountMinor}
            currency={t.currency}
            kind={t.type === "expense" ? "expense" : t.type === "income" ? "income" : "neutral"}
            signed={t.type !== "transfer"}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => (editing ? onCancelEdit() : onStartEdit())}
          >
            {editing ? "收合" : "編輯"}
          </button>
          {!editing && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (confirm("刪除這筆交易？")) remove.mutate({ id: t.id });
              }}
            >
              刪除
            </button>
          )}
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
              update.mutate({
                id: t.id,
                amount,
                categoryId: t.type === "transfer" ? undefined : categoryId || null,
                occurredAt: new Date(`${occurredAt}T00:00:00`),
                note: note || null,
              });
            }}
          >
            <div className="grid cols-3">
              <label>
                金額
                <input
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              {t.type !== "transfer" && (
                <label>
                  分類
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">未分類</option>
                    {catOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
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
            </div>
            <label>
              備註
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
            </label>
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
  invalidate,
}: {
  data: TransactionRow[] | undefined;
  loading: boolean;
  invalidate: () => Promise<unknown>;
}) {
  const categories = trpc.categories.list.useQuery();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (loading) return <SkeletonList rows={5} />;
  if (!data || data.length === 0) {
    return (
      <div className="muted">
        尚無記錄。<Link href="/entry">去記錄</Link>
      </div>
    );
  }

  return (
    <div className="list">
      {data.map((t) => (
        <TransactionItem
          key={t.id}
          t={t}
          categories={categories.data ?? []}
          editing={editingId === t.id}
          onStartEdit={() => setEditingId(t.id)}
          onCancelEdit={() => setEditingId(null)}
          invalidate={invalidate}
        />
      ))}
    </div>
  );
}
