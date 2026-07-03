"use client";

import { Amount } from "@/components/Amount";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS, todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

export function GeneralScheduleTab() {
  const utils = trpc.useUtils();
  const rules = trpc.recurring.list.useQuery();
  const accountList = trpc.accounts.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number]>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.recurring.list.invalidate(),
      utils.transactions.monthlySummary.invalidate(),
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
        訂閱、保險等非薪資的固定收支。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId) return;
          setError(null);
          create.mutate({
            name,
            kind,
            accountId,
            categoryId: categoryId || undefined,
            amount,
            frequency,
            dayOfMonth: frequency === "monthly" ? Number(dayOfMonth) : undefined,
            anchorDate,
            note: note || undefined,
          });
        }}
      >
        <div className="seg">
          <button
            type="button"
            className={kind === "income" ? "active" : ""}
            onClick={() => setKind("income")}
          >
            收入
          </button>
          <button
            type="button"
            className={kind === "expense" ? "active" : ""}
            onClick={() => setKind("expense")}
          >
            支出
          </button>
        </div>
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            帳戶
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
          {frequency === "monthly" && (
            <label>
              每月幾號
              <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          )}
          <label>
            起始日
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          </label>
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
          {rules.data.map((r) => (
            <div className="row" key={r.id}>
              <div className="meta">
                <span className="primary">{r.name}</span>
                <span className="secondary">
                  {FREQUENCY_LABELS[r.frequency]} · 下次 {r.nextRunDate}
                </span>
              </div>
              <div className="row-inline">
                <Amount
                  value={r.amountMinor}
                  currency={r.currency}
                  kind={r.kind}
                  signed
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setActive.mutate({ id: r.id, active: !r.active })}
                >
                  {r.active ? "暫停" : "啟用"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (confirm(`刪除「${r.name}」？`)) remove.mutate({ id: r.id });
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
