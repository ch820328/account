"use client";

import { Amount } from "@/components/Amount";
import { isInstallmentFinished, isInstallmentPaused } from "@/lib/installment-status";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

type InstallmentRow = {
  id: string;
  name: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  nextRunDate: string;
  totalPeriods: number | null;
  completedPeriods: number;
  active: boolean;
};

type EditDraft = {
  name: string;
  accountId: string;
  amount: string;
  dayOfMonth: string;
  totalPeriods: string;
};

type AccountOption = { id: string; name: string; currency: string };

function draftFromRow(s: InstallmentRow): EditDraft {
  return {
    name: s.name,
    accountId: s.accountId,
    amount: String(Number(s.amountMinor) / 100),
    dayOfMonth: String(s.dayOfMonth),
    totalPeriods: s.totalPeriods != null ? String(s.totalPeriods) : "",
  };
}

function InstallmentListItem({
  s,
  accounts,
  editing,
  editError,
  saving,
  onStartEdit,
  onCancelEdit,
  onSave,
  onToggleActive,
  onDelete,
}: {
  s: InstallmentRow;
  accounts: AccountOption[];
  editing: boolean;
  editError: string | null;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: EditDraft) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const finished = isInstallmentFinished(s);
  const paused = isInstallmentPaused(s);
  const [draft, setDraft] = useState<EditDraft>(() => draftFromRow(s));

  useEffect(() => {
    if (editing) setDraft(draftFromRow(s));
  }, [editing, s]);

  return (
    <div className={`list-item${finished ? " finished" : ""}${editing ? " editing" : ""}`}>
      <div className="row">
        <div className="meta">
          <span className="primary">
            {s.name}
            {finished && <span className="badge muted-badge">已結清</span>}
            {paused && <span className="badge muted-badge">已暫停</span>}
          </span>
          <span className="secondary">
            每月 {s.dayOfMonth} 日
            {!finished && ` · 下次 ${s.nextRunDate}`}
            {s.totalPeriods != null ? ` · ${s.completedPeriods}/${s.totalPeriods} 期` : ""}
          </span>
        </div>
        <div className="row-inline">
          {!editing && (
            <Amount
              value={s.amountMinor}
              currency={s.currency}
              kind={finished ? "neutral" : "expense"}
              signed={!finished}
            />
          )}
          {!finished && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => (editing ? onCancelEdit() : onStartEdit())}
            >
              {editing ? "收合" : "編輯"}
            </button>
          )}
          {!finished && !editing && (
            <button type="button" className="btn ghost" onClick={onToggleActive}>
              {s.active ? "暫停" : "啟用"}
            </button>
          )}
          {!editing && (
            <button type="button" className="btn ghost" onClick={onDelete}>
              刪除
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="row-edit-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(draft);
            }}
          >
            <div className="grid cols-3">
              <label>
                名稱
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label>
                扣款帳戶
                <select
                  value={draft.accountId}
                  onChange={(e) => setDraft((d) => ({ ...d, accountId: e.target.value }))}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}（{a.currency}）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                每月金額
                <input
                  required
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid cols-3">
              <label>
                每月扣款日
                <input
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={draft.dayOfMonth}
                  onChange={(e) => setDraft((d) => ({ ...d, dayOfMonth: e.target.value }))}
                />
              </label>
              <label>
                總期數
                <input
                  required
                  inputMode="numeric"
                  min={s.completedPeriods || 1}
                  max={120}
                  value={draft.totalPeriods}
                  onChange={(e) => setDraft((d) => ({ ...d, totalPeriods: e.target.value }))}
                />
              </label>
              <label>
                <span className="secondary" style={{ fontSize: 12 }}>
                  已扣 {s.completedPeriods} 期，總期數不可小於此
                </span>
              </label>
            </div>
            {editError && <div className="error">{editError}</div>}
            <div className="row-inline">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
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

export function InstallmentTab() {
  const utils = trpc.useUtils();
  const list = trpc.installments.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [totalPeriods, setTotalPeriods] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const create = trpc.installments.create.useMutation({
    onSuccess: async () => {
      await utils.installments.list.invalidate();
      await utils.forecast.projection.invalidate();
      setName("");
      setAmount("");
      setDayOfMonth("1");
      setTotalPeriods("");
      setCreateError(null);
    },
    onError: (e) => setCreateError(e.message),
  });

  const update = trpc.installments.update.useMutation({
    onSuccess: async () => {
      await utils.installments.list.invalidate();
      await utils.forecast.projection.invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (e) => setEditError(e.message),
  });

  const setActive = trpc.installments.setActive.useMutation({
    onSuccess: () => {
      utils.installments.list.invalidate();
      utils.forecast.projection.invalidate();
    },
  });
  const remove = trpc.installments.delete.useMutation({
    onSuccess: () => {
      utils.installments.list.invalidate();
      utils.forecast.projection.invalidate();
      if (editingId) setEditingId(null);
    },
  });

  const { activeList, finishedList } = useMemo(() => {
    const rows = (list.data ?? []) as InstallmentRow[];
    return {
      activeList: rows.filter((s) => !isInstallmentFinished(s)),
      finishedList: rows.filter((s) => isInstallmentFinished(s)),
    };
  }, [list.data]);

  const accountOptions = accounts.data ?? [];

  useEffect(() => {
    if (!accountId && accountOptions.length) setAccountId(accountOptions[0]!.id);
  }, [accountOptions, accountId]);

  function saveEdit(id: string, draft: EditDraft) {
    if (!draft.accountId || !draft.totalPeriods) return;
    setEditError(null);
    update.mutate({
      id,
      name: draft.name,
      accountId: draft.accountId,
      amount: draft.amount,
      dayOfMonth: Number(draft.dayOfMonth),
      totalPeriods: Number(draft.totalPeriods),
    });
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        信用卡分期、消費貸款等：指定扣款帳戶、每月金額與總期數，到期自動記支出並標為已結清。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId || !totalPeriods) return;
          setCreateError(null);
          create.mutate({
            name,
            accountId,
            amount,
            dayOfMonth: Number(dayOfMonth),
            totalPeriods: Number(totalPeriods),
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone 分期" />
          </label>
          <label>
            扣款帳戶
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（{a.currency}）
                </option>
              ))}
            </select>
          </label>
          <label>
            每月金額
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <div className="grid cols-3">
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
            總期數
            <input
              required
              inputMode="numeric"
              min={1}
              max={120}
              value={totalPeriods}
              onChange={(e) => setTotalPeriods(e.target.value)}
              placeholder="12"
            />
          </label>
        </div>
        {createError && <div className="error">{createError}</div>}
        <button className="btn" disabled={create.isPending}>
          {create.isPending ? "新增中…" : "新增分期"}
        </button>
      </form>

      <div className="section-title">進行中</div>
      {list.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !activeList.length ? (
        <div className="muted">尚無進行中的分期。</div>
      ) : (
        <div className="list">
          {activeList.map((s) => (
            <InstallmentListItem
              key={s.id}
              s={s}
              accounts={accountOptions}
              editing={editingId === s.id}
              editError={editingId === s.id ? editError : null}
              saving={update.isPending && editingId === s.id}
              onStartEdit={() => {
                setEditError(null);
                setEditingId(s.id);
              }}
              onCancelEdit={() => {
                setEditError(null);
                setEditingId(null);
              }}
              onSave={(draft) => saveEdit(s.id, draft)}
              onToggleActive={() => setActive.mutate({ id: s.id, active: !s.active })}
              onDelete={() => {
                if (confirm(`刪除「${s.name}」？`)) remove.mutate({ id: s.id });
              }}
            />
          ))}
        </div>
      )}

      {finishedList.length > 0 && (
        <>
          <div className="section-title">已結清</div>
          <div className="list">
            {finishedList.map((s) => (
              <InstallmentListItem
                key={s.id}
                s={s}
                accounts={accountOptions}
                editing={false}
                editError={null}
                saving={false}
                onStartEdit={() => {}}
                onCancelEdit={() => {}}
                onSave={() => {}}
                onToggleActive={() => {}}
                onDelete={() => {
                  if (confirm(`刪除「${s.name}」？`)) remove.mutate({ id: s.id });
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
