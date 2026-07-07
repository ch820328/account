"use client";

import { Amount } from "@/components/Amount";
import { EditableRow } from "@/components/schedule/EditableRow";
import { trpc } from "@/lib/trpc";
import { isLiabilityType } from "@/lib/labels";
import { useEffect, useState } from "react";

type TierDraft = { fromPeriod: string; toPeriod: string; amount: string };

type LoanRow = {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  nextRunDate: string;
  completedPeriods: number;
  totalPeriods: number | null;
  note: string | null;
  active: boolean;
  tiers: { id: string; fromPeriod: number; toPeriod: number; amountMinor: bigint }[];
};

function TierEditor({
  tiers,
  onChange,
}: {
  tiers: TierDraft[];
  onChange: (t: TierDraft[]) => void;
}) {
  return (
    <div>
      <span className="field-label">分段繳款（選填）— 例如 新青安：1~36 期寬限、37~420 期本息</span>
      {tiers.map((t, i) => (
        <div className="tier-row" key={i}>
          <input
            inputMode="numeric"
            placeholder="起"
            value={t.fromPeriod}
            onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, fromPeriod: e.target.value } : x)))}
          />
          <span className="muted">~</span>
          <input
            inputMode="numeric"
            placeholder="迄"
            value={t.toPeriod}
            onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, toPeriod: e.target.value } : x)))}
          />
          <span className="muted">期</span>
          <input
            inputMode="decimal"
            placeholder="每月金額"
            value={t.amount}
            onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => onChange(tiers.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost"
        onClick={() => onChange([...tiers, { fromPeriod: "", toPeriod: "", amount: "" }])}
      >
        + 分段
      </button>
    </div>
  );
}

function toTierPayload(tiers: TierDraft[]) {
  return tiers
    .filter((t) => t.fromPeriod && t.toPeriod && t.amount)
    .map((t) => ({
      fromPeriod: Number(t.fromPeriod),
      toPeriod: Number(t.toPeriod),
      amount: t.amount,
    }));
}

export function LoanTab() {
  const utils = trpc.useUtils();
  const schedules = trpc.loanPayments.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [name, setName] = useState("");
  const [owed, setOwed] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [totalPeriods, setTotalPeriods] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const assetAccounts = (accounts.data ?? []).filter((a) => !isLiabilityType(a.type));

  const invalidate = () =>
    Promise.all([
      utils.loanPayments.list.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.listWithBalances.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.loanPayments.createWithLiability.useMutation();

  const update = trpc.loanPayments.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.loanPayments.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.loanPayments.delete.useMutation({ onSuccess: invalidate });

  useEffect(() => {
    if (!sourceAccountId && assetAccounts.length) setSourceAccountId(assetAccounts[0]!.id);
  }, [assetAccounts, sourceAccountId]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceAccountId) return;
    setError(null);
    setSaving(true);
    try {
      // Server creates the liability account and schedule atomically.
      await create.mutateAsync({
        name,
        owedBalance: owed || "0",
        sourceAccountId,
        amount,
        dayOfMonth: Number(dayOfMonth),
        totalPeriods: totalPeriods ? Number(totalPeriods) : undefined,
        tiers: toTierPayload(tiers),
        note: note || undefined,
      });
      await invalidate();
      setName("");
      setOwed("");
      setAmount("");
      setNote("");
      setTotalPeriods("");
      setTiers([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        房貸、信貸等每月還款：填目前欠款與每月扣款，系統會自動建立負債並逐月減少欠款。
        利率不同或有寬限期時，用「分段繳款」設定各期金額。
      </p>

      <form className="card" onSubmit={submitCreate}>
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="房貸（新青安）" />
          </label>
          <label>
            目前欠款餘額
            <input required inputMode="decimal" value={owed} onChange={(e) => setOwed(e.target.value)} placeholder="8000000" />
          </label>
          <label>
            扣款銀行帳戶
            <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
              {assetAccounts.length === 0 && <option value="">請先新增銀行帳戶</option>}
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
            每月還款金額（預設）
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            每月扣款日
            <input inputMode="numeric" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </label>
          <label>
            總期數（選填，如 420）
            <input inputMode="numeric" value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} placeholder="420" />
          </label>
        </div>
        <TierEditor tiers={tiers} onChange={setTiers} />
        <label>
          備註
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={saving || !sourceAccountId || assetAccounts.length === 0}>
          {saving ? "新增中…" : "新增還款排程"}
        </button>
      </form>

      <div className="section-title">還款排程</div>
      {schedules.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !schedules.data?.length ? (
        <div className="muted">尚無還款排程。</div>
      ) : (
        <div className="list">
          {(schedules.data as LoanRow[]).map((s) => (
            <LoanItem
              key={s.id}
              s={s}
              editing={editingId === s.id}
              saving={update.isPending && editingId === s.id}
              onEdit={() => setEditingId(s.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: s.id, ...patch })}
              onToggleActive={() => setActive.mutate({ id: s.id, active: !s.active })}
              onDelete={() => {
                if (confirm(`刪除「${s.name}」？`)) remove.mutate({ id: s.id });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LoanItem({
  s,
  editing,
  saving,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
}: {
  s: LoanRow;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    amount: string;
    dayOfMonth: number;
    totalPeriods: number | null;
    tiers: { fromPeriod: number; toPeriod: number; amount: string }[];
    note?: string | null;
  }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [amount, setAmount] = useState(String(Number(s.amountMinor) / 100));
  const [dayOfMonth, setDayOfMonth] = useState(String(s.dayOfMonth));
  const [totalPeriods, setTotalPeriods] = useState(s.totalPeriods != null ? String(s.totalPeriods) : "");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [note, setNote] = useState(s.note ?? "");

  useEffect(() => {
    if (editing) {
      setName(s.name);
      setAmount(String(Number(s.amountMinor) / 100));
      setDayOfMonth(String(s.dayOfMonth));
      setTotalPeriods(s.totalPeriods != null ? String(s.totalPeriods) : "");
      setNote(s.note ?? "");
      setTiers(
        s.tiers.map((t) => ({
          fromPeriod: String(t.fromPeriod),
          toPeriod: String(t.toPeriod),
          amount: String(Number(t.amountMinor) / 100),
        })),
      );
    }
  }, [editing, s]);

  const progress =
    s.totalPeriods != null ? ` · ${s.completedPeriods}/${s.totalPeriods} 期` : "";
  const tierSummary =
    s.tiers.length > 0
      ? ` · 分段 ${s.tiers.length} 段`
      : "";

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={s.active}
      onToggleActive={onToggleActive}
      primary={
        <>
          {s.name}
          {!s.active && <span className="badge muted-badge">已暫停</span>}
        </>
      }
      secondary={`每月 ${s.dayOfMonth} 日 · 下次 ${s.nextRunDate}${progress}${tierSummary}`}
      right={<Amount value={s.amountMinor} currency={s.currency} kind="expense" signed />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            amount,
            dayOfMonth: Number(dayOfMonth),
            totalPeriods: totalPeriods ? Number(totalPeriods) : null,
            tiers: toTierPayload(tiers),
            note: note || null,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            每月還款金額（預設）
            <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            每月扣款日
            <input inputMode="numeric" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </label>
        </div>
        <label>
          總期數（選填）
          <input inputMode="numeric" value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} placeholder="420" />
        </label>
        <TierEditor tiers={tiers} onChange={setTiers} />
        <label>
          備註
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
        </label>
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
