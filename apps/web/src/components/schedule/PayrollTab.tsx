"use client";

import { Amount } from "@/components/Amount";
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

export function PayrollTab() {
  const utils = trpc.useUtils();
  const profiles = trpc.payroll.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("月薪");
  const [depositAccountId, setDepositAccountId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("25");
  const [lines, setLines] = useState<LineDraft[]>(DEFAULT_LINES);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.payroll.create.useMutation({
    onSuccess: async () => {
      await utils.payroll.list.invalidate();
      resetForm();
    },
    onError: (e) => setError(e.message),
  });

  const update = trpc.payroll.update.useMutation({
    onSuccess: async () => {
      await utils.payroll.list.invalidate();
      resetForm();
    },
    onError: (e) => setError(e.message),
  });

  const setActive = trpc.payroll.setActive.useMutation({
    onSuccess: () => utils.payroll.list.invalidate(),
  });
  const remove = trpc.payroll.delete.useMutation({
    onSuccess: () => utils.payroll.list.invalidate(),
  });

  const totals = useMemo(() => previewTotals(lines), [lines]);

  useEffect(() => {
    if (!depositAccountId && accounts.data?.length) {
      setDepositAccountId(accounts.data[0]!.id);
    }
  }, [accounts.data, depositAccountId]);

  function resetForm() {
    setEditingId(null);
    setName("月薪");
    setLines(DEFAULT_LINES);
    setDayOfMonth("25");
    setError(null);
  }

  function loadProfile(id: string) {
    const p = profiles.data?.find((x) => x.id === id);
    if (!p) return;
    setEditingId(p.id);
    setName(p.name);
    setDepositAccountId(p.depositAccountId);
    setDayOfMonth(String(p.dayOfMonth));
    setLines(
      p.lines.map((l) => ({
        name: l.name,
        kind: l.kind as "earning" | "deduction",
        amount: String(Number(l.amountMinor) / 100),
      })),
    );
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        設定薪資收入與扣款項目，每月固定日期自動記帳。實領 = 收入合計 − 扣款合計。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!depositAccountId) return;
          setError(null);
          const payload = {
            name,
            depositAccountId,
            dayOfMonth: Number(dayOfMonth),
            lines: lines.filter((l) => l.name.trim()),
          };
          if (editingId) update.mutate({ id: editingId, ...payload });
          else create.mutate(payload);
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
              {(accounts.data ?? []).map((a) => (
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
              onClick={() =>
                setLines((prev) => [...prev, { name: "", kind: "earning", amount: "0" }])
              }
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
              onClick={() =>
                setLines((prev) => [...prev, { name: "", kind: "deduction", amount: "0" }])
              }
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
          <button className="btn" disabled={create.isPending || update.isPending}>
            {editingId ? "儲存變更" : "新增薪資單"}
          </button>
          {editingId && (
            <button type="button" className="btn ghost" onClick={resetForm}>
              取消編輯
            </button>
          )}
        </div>
      </form>

      <div className="section-title">已設定薪資</div>
      {profiles.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !profiles.data?.length ? (
        <div className="muted">尚無薪資單。</div>
      ) : (
        <div className="list">
          {profiles.data.map((p) => (
            <div className="row" key={p.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="row-inline" style={{ justifyContent: "space-between", width: "100%" }}>
                <div className="meta">
                  <span className="primary">
                    {p.name}
                    {!p.active && <span className="badge muted-badge">已暫停</span>}
                  </span>
                  <span className="secondary">
                    每月 {p.dayOfMonth} 日 · 下次 {p.nextRunDate} · 實領{" "}
                    <Amount value={p.totals.netMinor} currency={p.currency} kind="income" variant="inline" />
                  </span>
                </div>
                <div className="row-inline">
                  <button type="button" className="btn ghost" onClick={() => loadProfile(p.id)}>
                    編輯
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setActive.mutate({ id: p.id, active: !p.active })}
                  >
                    {p.active ? "暫停" : "啟用"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      if (confirm(`刪除「${p.name}」？`)) remove.mutate({ id: p.id });
                    }}
                  >
                    刪除
                  </button>
                </div>
              </div>
              <div className="payroll-mini-table">
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
              </div>
            </div>
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
    <div className="row-inline" style={{ marginBottom: 8 }}>
      <input
        placeholder="項目名稱"
        value={line.name}
        onChange={(e) => onChange({ ...line, name: e.target.value })}
        style={{ flex: 2 }}
      />
      <input
        inputMode="decimal"
        placeholder="0"
        value={line.amount}
        onChange={(e) => onChange({ ...line, amount: e.target.value })}
        style={{ flex: 1 }}
      />
      <button type="button" className="btn ghost" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}
