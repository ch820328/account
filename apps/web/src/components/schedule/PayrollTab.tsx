"use client";

import { Amount } from "@/components/Amount";
import { EditableRow } from "@/components/schedule/EditableRow";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

type LineDraft = { name: string; kind: "earning" | "deduction"; amount: string };

const DEFAULT_LINES: LineDraft[] = [
  { name: "基本薪資", kind: "earning", amount: "190000" },
  { name: "伙食津貼(免稅)", kind: "earning", amount: "0" },
  { name: "福利金", kind: "deduction", amount: "950" },
  { name: "勞保費", kind: "deduction", amount: "1145" },
  { name: "健保費", kind: "deduction", amount: "5646" },
  { name: "所得稅預扣", kind: "deduction", amount: "9500" },
];

function parseAmount(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function previewTotals(lines: LineDraft[]) {
  let earn = 0;
  let ded = 0;
  for (const l of lines) {
    if (l.kind === "earning") earn += parseAmount(l.amount);
    else ded += parseAmount(l.amount);
  }
  return { earn, ded, net: earn - ded };
}

interface PayrollFormValues {
  name: string;
  depositAccountId: string;
  dayOfMonth: string;
  lines: LineDraft[];
}

function PayrollForm({
  accounts,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  accounts: { id: string; name: string }[];
  initial: PayrollFormValues;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: { name: string; depositAccountId: string; dayOfMonth: number; lines: LineDraft[] }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [depositAccountId, setDepositAccountId] = useState(initial.depositAccountId);
  const [dayOfMonth, setDayOfMonth] = useState(initial.dayOfMonth);
  const [lines, setLines] = useState<LineDraft[]>(initial.lines);

  const totals = useMemo(() => previewTotals(lines), [lines]);

  useEffect(() => {
    if (!depositAccountId && accounts.length) setDepositAccountId(accounts[0]!.id);
  }, [accounts, depositAccountId]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!depositAccountId) return;
        onSubmit({
          name,
          depositAccountId,
          dayOfMonth: Number(dayOfMonth),
          lines: lines.filter((l) => l.name.trim()),
        });
      }}
    >
      <div className="grid cols-3">
        <label>
          名稱
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          入帳帳戶
          <select value={depositAccountId} onChange={(e) => setDepositAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          每月入帳日
          <input
            inputMode="numeric"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </label>
      </div>

      <div className="payroll-grid">
        <div>
          <div className="section-title" style={{ marginTop: 8 }}>
            收入項目
          </div>
          {lines
            .map((line, idx) => ({ line, idx }))
            .filter(({ line }) => line.kind === "earning")
            .map(({ line, idx }) => (
              <PayrollLineRow
                key={idx}
                line={line}
                onChange={(l) => setLines((prev) => prev.map((x, i) => (i === idx ? l : x)))}
                onRemove={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setLines((prev) => [...prev, { name: "", kind: "earning", amount: "0" }])}
          >
            + 收入
          </button>
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 8 }}>
            扣款項目
          </div>
          {lines
            .map((line, idx) => ({ line, idx }))
            .filter(({ line }) => line.kind === "deduction")
            .map(({ line, idx }) => (
              <PayrollLineRow
                key={idx}
                line={line}
                onChange={(l) => setLines((prev) => prev.map((x, i) => (i === idx ? l : x)))}
                onRemove={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setLines((prev) => [...prev, { name: "", kind: "deduction", amount: "0" }])}
          >
            + 扣款
          </button>
        </div>
      </div>

      <div className="card" style={{ background: "var(--surface-2)", marginTop: 8 }}>
        <div className="row-inline" style={{ justifyContent: "space-between" }}>
          <span className="income">收入 ${totals.earn.toLocaleString()}</span>
          <span className="expense">扣款 ${totals.ded.toLocaleString()}</span>
          <span className="primary" style={{ fontWeight: 700 }}>
            實領 ${totals.net.toLocaleString()}
          </span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="row-inline">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "儲存中…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}

type ProfileRow = {
  id: string;
  name: string;
  depositAccountId: string;
  dayOfMonth: number;
  nextRunDate: string;
  currency: string;
  active: boolean;
  totals: { netMinor: bigint };
  lines: { id: string; name: string; kind: string; amountMinor: bigint }[];
};

export function PayrollTab() {
  const utils = trpc.useUtils();
  const profiles = trpc.payroll.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [createKey, setCreateKey] = useState(0);

  const invalidate = () =>
    Promise.all([
      utils.payroll.list.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.payroll.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setCreateError(null);
      setCreateKey((k) => k + 1);
    },
    onError: (e) => setCreateError(e.message),
  });

  const update = trpc.payroll.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (e) => setEditError(e.message),
  });

  const setActive = trpc.payroll.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.payroll.delete.useMutation({ onSuccess: invalidate });

  const accountOptions = accounts.data ?? [];

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        設定薪資收入與扣款項目，每月固定日期自動記帳。實領 = 收入合計 − 扣款合計。
      </p>

      <div className="card">
        <PayrollForm
          key={createKey}
          accounts={accountOptions}
          initial={{
            name: "月薪",
            depositAccountId: accountOptions[0]?.id ?? "",
            dayOfMonth: "25",
            lines: DEFAULT_LINES,
          }}
          submitLabel="新增薪資單"
          pending={create.isPending}
          error={createError}
          onSubmit={(v) => {
            setCreateError(null);
            create.mutate(v);
          }}
        />
      </div>

      <div className="section-title">已設定薪資</div>
      {profiles.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !profiles.data?.length ? (
        <div className="muted">尚無薪資單。</div>
      ) : (
        <div className="list">
          {(profiles.data as ProfileRow[]).map((p) => (
            <EditableRow
              key={p.id}
              editing={editingId === p.id}
              onEdit={() => {
                setEditError(null);
                setEditingId(p.id);
              }}
              onClose={() => setEditingId(null)}
              onDelete={() => {
                if (confirm(`刪除「${p.name}」？`)) remove.mutate({ id: p.id });
              }}
              active={p.active}
              onToggleActive={() => setActive.mutate({ id: p.id, active: !p.active })}
              primary={
                <>
                  {p.name}
                  {!p.active && <span className="badge muted-badge">已暫停</span>}
                </>
              }
              secondary={
                <>
                  每月 {p.dayOfMonth} 日 · 下次 {p.nextRunDate} · 實領{" "}
                  <Amount value={p.totals.netMinor} currency={p.currency} kind="income" variant="inline" />
                  <span className="payroll-mini-table">
                    {p.lines.map((l) => (
                      <span key={l.id} className={l.kind === "earning" ? "income" : "expense"}>
                        {l.name}{" "}
                        <Amount
                          value={l.amountMinor}
                          currency={p.currency}
                          kind={l.kind === "earning" ? "income" : "expense"}
                          signed={l.kind === "deduction"}
                          variant="inline"
                        />
                      </span>
                    ))}
                  </span>
                </>
              }
            >
              {editingId === p.id && (
                <PayrollForm
                  accounts={accountOptions}
                  initial={{
                    name: p.name,
                    depositAccountId: p.depositAccountId,
                    dayOfMonth: String(p.dayOfMonth),
                    lines: p.lines.map((l) => ({
                      name: l.name,
                      kind: l.kind as "earning" | "deduction",
                      amount: String(Number(l.amountMinor) / 100),
                    })),
                  }}
                  submitLabel="儲存"
                  pending={update.isPending}
                  error={editError}
                  onSubmit={(v) => {
                    setEditError(null);
                    update.mutate({ id: p.id, ...v });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </EditableRow>
          ))}
        </div>
      )}
    </div>
  );
}

function PayrollLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  onChange: (l: LineDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="payroll-line">
      <input
        placeholder="項目名稱"
        value={line.name}
        onChange={(e) => onChange({ ...line, name: e.target.value })}
      />
      <input
        inputMode="decimal"
        placeholder="0"
        value={line.amount}
        onChange={(e) => onChange({ ...line, amount: e.target.value })}
      />
      <button type="button" className="btn ghost" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}
