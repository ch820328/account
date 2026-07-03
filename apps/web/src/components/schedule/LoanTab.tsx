"use client";

import { Amount } from "@/components/Amount";
import { trpc } from "@/lib/trpc";
import { isLiabilityType } from "@/lib/labels";
import { useEffect, useState } from "react";

export function LoanTab() {
  const utils = trpc.useUtils();
  const schedules = trpc.loanPayments.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [name, setName] = useState("");
  const [liabilityAccountId, setLiabilityAccountId] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const liabilityAccounts = (accounts.data ?? []).filter((a) => isLiabilityType(a.type));
  const assetAccounts = (accounts.data ?? []).filter((a) => !isLiabilityType(a.type));

  const create = trpc.loanPayments.create.useMutation({
    onSuccess: async () => {
      await utils.loanPayments.list.invalidate();
      setName("");
      setAmount("");
      setNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const setActive = trpc.loanPayments.setActive.useMutation({
    onSuccess: () => utils.loanPayments.list.invalidate(),
  });
  const remove = trpc.loanPayments.delete.useMutation({
    onSuccess: () => utils.loanPayments.list.invalidate(),
  });

  useEffect(() => {
    if (!liabilityAccountId && liabilityAccounts.length)
      setLiabilityAccountId(liabilityAccounts[0]!.id);
    if (!sourceAccountId && assetAccounts.length) setSourceAccountId(assetAccounts[0]!.id);
  }, [liabilityAccounts, assetAccounts, liabilityAccountId, sourceAccountId]);

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        房貸、信貸等每月還款：從銀行帳戶轉到負債帳戶，自動減少欠款。
        請先在「帳戶」建立負債帳戶並填入目前欠款餘額。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!liabilityAccountId || !sourceAccountId) return;
          setError(null);
          create.mutate({
            name,
            liabilityAccountId,
            sourceAccountId,
            amount,
            dayOfMonth: Number(dayOfMonth),
            note: note || undefined,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="房貸" />
          </label>
          <label>
            負債帳戶
            <select
              value={liabilityAccountId}
              onChange={(e) => setLiabilityAccountId(e.target.value)}
            >
              {liabilityAccounts.length === 0 && <option value="">請先新增負債帳戶</option>}
              {liabilityAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            扣款銀行帳戶
            <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid cols-3">
          <label>
            每月還款金額
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            每月扣款日
            <input
              inputMode="numeric"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          </label>
          <label>
            備註
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <button
          className="btn"
          disabled={create.isPending || !liabilityAccountId || liabilityAccounts.length === 0}
        >
          {create.isPending ? "新增中…" : "新增還款排程"}
        </button>
      </form>

      <div className="section-title">還款排程</div>
      {schedules.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !schedules.data?.length ? (
        <div className="muted">尚無還款排程。</div>
      ) : (
        <div className="list">
          {schedules.data.map((s) => (
            <div className="row" key={s.id}>
              <div className="meta">
                <span className="primary">
                  {s.name}
                  {!s.active && <span className="badge muted-badge">已暫停</span>}
                </span>
                <span className="secondary">
                  每月 {s.dayOfMonth} 日 · 下次 {s.nextRunDate}
                </span>
              </div>
              <div className="row-inline">
                <Amount value={s.amountMinor} currency={s.currency} kind="expense" signed />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setActive.mutate({ id: s.id, active: !s.active })}
                >
                  {s.active ? "暫停" : "啟用"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (confirm(`刪除「${s.name}」？`)) remove.mutate({ id: s.id });
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
