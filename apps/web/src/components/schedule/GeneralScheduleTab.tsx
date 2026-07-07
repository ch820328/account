"use client";

import { Amount } from "@/components/Amount";
import { EditableRow } from "@/components/schedule/EditableRow";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS, todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

type RuleKind = "income" | "expense" | "transfer";

type RuleRow = {
  id: string;
  name: string;
  kind: RuleKind;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  amountMinor: bigint;
  currency: string;
  frequency: string;
  dayOfMonth: number | null;
  nextRunDate: string;
  active: boolean;
};

const KIND_LABELS: Record<RuleKind, string> = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
};

export function GeneralScheduleTab() {
  const utils = trpc.useUtils();
  const rules = trpc.recurring.list.useQuery();
  const accountList = trpc.accounts.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<RuleKind>("expense");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.recurring.list.invalidate(),
      utils.transactions.monthlySummary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.recurring.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setAmount("");
      setNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.recurring.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.recurring.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.recurring.delete.useMutation({ onSuccess: invalidate });

  useEffect(() => {
    if (!accountId && accountList.data?.length) setAccountId(accountList.data[0]!.id);
  }, [accountList.data, accountId]);

  const filteredCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.kind === kind),
    [categories.data, kind],
  );

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        訂閱、保險等非薪資的固定收支，或帳戶間的定期轉帳（例如每月轉存到儲蓄戶）。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId) return;
          if (kind === "transfer" && (!transferAccountId || transferAccountId === accountId)) {
            setError("轉帳需選擇不同的轉入帳戶");
            return;
          }
          setError(null);
          create.mutate({
            name,
            kind,
            accountId,
            transferAccountId: kind === "transfer" ? transferAccountId : undefined,
            categoryId: kind === "transfer" ? undefined : categoryId || undefined,
            amount,
            frequency,
            dayOfMonth: frequency === "monthly" ? Number(dayOfMonth) : undefined,
            anchorDate,
            note: note || undefined,
          });
        }}
      >
        <div className="seg">
          <button type="button" className={kind === "income" ? "active" : ""} onClick={() => setKind("income")}>
            收入
          </button>
          <button type="button" className={kind === "expense" ? "active" : ""} onClick={() => setKind("expense")}>
            支出
          </button>
          <button type="button" className={kind === "transfer" ? "active" : ""} onClick={() => setKind("transfer")}>
            轉帳
          </button>
        </div>
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {kind === "transfer" ? "從帳戶" : "帳戶"}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {(accountList.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            金額
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <div className="grid cols-3">
          {kind === "transfer" ? (
            <label>
              轉入帳戶
              <select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)}>
                <option value="">請選擇</option>
                {(accountList.data ?? [])
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <label>
              分類（選填）
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">未分類</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            頻率
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          {frequency === "monthly" ? (
            <label>
              每月幾號
              <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          ) : (
            <label>
              起始日
              <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
            </label>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={create.isPending}>
          新增
        </button>
      </form>

      <div className="section-title">已設定</div>
      {!rules.data?.length ? (
        <div className="muted">尚無。</div>
      ) : (
        <div className="list">
          {(rules.data as RuleRow[]).map((r) => (
            <RuleItem
              key={r.id}
              r={r}
              categories={categories.data ?? []}
              editing={editingId === r.id}
              saving={update.isPending && editingId === r.id}
              onEdit={() => setEditingId(r.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: r.id, ...patch })}
              onToggleActive={() => setActive.mutate({ id: r.id, active: !r.active })}
              onDelete={() => {
                if (confirm(`刪除「${r.name}」？`)) remove.mutate({ id: r.id });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleItem({
  r,
  categories,
  editing,
  saving,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
}: {
  r: RuleRow;
  categories: { id: string; name: string; kind: string }[];
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: { name: string; amount: string; dayOfMonth?: number; categoryId?: string }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(r.name);
  const [amount, setAmount] = useState(String(Number(r.amountMinor) / 100));
  const [dayOfMonth, setDayOfMonth] = useState(String(r.dayOfMonth ?? 1));
  const [categoryId, setCategoryId] = useState(r.categoryId ?? "");

  useEffect(() => {
    if (editing) {
      setName(r.name);
      setAmount(String(Number(r.amountMinor) / 100));
      setDayOfMonth(String(r.dayOfMonth ?? 1));
      setCategoryId(r.categoryId ?? "");
    }
  }, [editing, r]);

  const catOptions = categories.filter((c) => c.kind === r.kind);
  const isTransfer = r.kind === "transfer";

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={r.active}
      onToggleActive={onToggleActive}
      primary={
        <>
          {r.name}
          <span className="badge muted-badge">{KIND_LABELS[r.kind]}</span>
          {!r.active && <span className="badge muted-badge">已暫停</span>}
        </>
      }
      secondary={`${FREQUENCY_LABELS[r.frequency]} · 下次 ${r.nextRunDate}`}
      right={
        <Amount
          value={r.amountMinor}
          currency={r.currency}
          kind={r.kind === "income" ? "income" : r.kind === "expense" ? "expense" : "neutral"}
          signed={!isTransfer}
        />
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            amount,
            dayOfMonth: r.frequency === "monthly" ? Number(dayOfMonth) : undefined,
            categoryId: isTransfer ? undefined : categoryId || undefined,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            金額
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {r.frequency === "monthly" && (
            <label>
              每月幾號
              <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          )}
        </div>
        {!isTransfer && (
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
        <div className="row-inline">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </EditableRow>
  );
}
