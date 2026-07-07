"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  isPositiveLedgerKind,
  LOAN_LEDGER_KIND_LABELS,
  LOAN_LEDGER_KIND_OPTIONS,
  type LoanLedgerKind,
  todayIso,
} from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function LendingPage() {
  const { ready } = useAuthGuard();
  const utils = trpc.useUtils();

  const summary = trpc.personalLoans.summary.useQuery(undefined, { enabled: ready });
  const nwSetting = trpc.personalLoans.netWorthSetting.useQuery(undefined, {
    enabled: ready,
  });
  const setNwSetting = trpc.personalLoans.setNetWorthSetting.useMutation({
    onSuccess: () => {
      utils.personalLoans.netWorthSetting.invalidate();
      utils.netWorth.summary.invalidate();
    },
  });

  const [counterparty, setCounterparty] = useState("");
  const [kind, setKind] = useState<LoanLedgerKind>("lend");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const invalidate = () => utils.personalLoans.summary.invalidate();

  const create = trpc.personalLoans.create.useMutation({
    onSuccess: async (_data, vars) => {
      await invalidate();
      await utils.personalLoans.entries.invalidate({ counterparty: vars.counterparty });
      setAmount("");
      setNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  if (!ready) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  const base = "TWD";

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>借款</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          記錄你借給別人、或跟別人借的錢。依對象累計，點開看每筆明細。
        </p>

        <label className="row-inline" style={{ marginBottom: 20, gap: 8, color: "var(--text)" }}>
          <input
            type="checkbox"
            checked={nwSetting.data?.includeInNetWorth ?? false}
            onChange={(e) => setNwSetting.mutate({ include: e.target.checked })}
            style={{ width: "auto" }}
          />
          併入淨資產（對方欠我算應收資產、我欠對方算應付負債）
        </label>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!counterparty.trim() || !amount) return;
            setError(null);
            create.mutate({
              counterparty: counterparty.trim(),
              kind,
              amount,
              currency: base,
              occurredAt: date,
              note: note || undefined,
            });
          }}
        >
          <div className="grid cols-2">
            <label>
              對象
              <input
                required
                list="lending-people"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="例如 小明"
              />
              <datalist id="lending-people">
                {(summary.data ?? []).map((p) => (
                  <option key={p.counterparty} value={p.counterparty} />
                ))}
              </datalist>
            </label>
            <label>
              類型
              <select value={kind} onChange={(e) => setKind(e.target.value as LoanLedgerKind)}>
                {LOAN_LEDGER_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid cols-2">
            <label>
              金額
              <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              日期
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label>
            備註
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增紀錄"}
          </button>
        </form>

        <div className="section-title">對象累計</div>
        {summary.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !summary.data?.length ? (
          <div className="muted">尚無借款紀錄。</div>
        ) : (
          <div className="list">
            {summary.data.map((p) => {
              const owesMe = p.netMinor > 0n;
              const settled = p.netMinor === 0n;
              return (
                <div className={`list-item${openPerson === p.counterparty ? " editing" : ""}`} key={p.counterparty}>
                  <div
                    className="row"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      setOpenPerson(openPerson === p.counterparty ? null : p.counterparty)
                    }
                  >
                    <div className="meta">
                      <span className="primary">{p.counterparty}</span>
                      <span className="secondary">
                        {settled
                          ? "已結清"
                          : owesMe
                            ? "對方欠我"
                            : "我欠對方"}{" "}
                        · {p.entryCount} 筆 · 最後 {p.lastDate}
                      </span>
                    </div>
                    <Amount
                      value={p.netMinor < 0n ? -p.netMinor : p.netMinor}
                      currency={p.currency}
                      kind={settled ? "neutral" : owesMe ? "income" : "expense"}
                    />
                  </div>
                  {openPerson === p.counterparty && (
                    <div className="row-edit-panel">
                      <PersonEntries counterparty={p.counterparty} onChanged={invalidate} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function PersonEntries({
  counterparty,
  onChanged,
}: {
  counterparty: string;
  onChanged: () => Promise<unknown>;
}) {
  const utils = trpc.useUtils();
  const entries = trpc.personalLoans.entries.useQuery({ counterparty });
  const remove = trpc.personalLoans.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.personalLoans.entries.invalidate({ counterparty }), onChanged()]);
    },
  });

  if (entries.isLoading) return <div className="muted">載入中…</div>;
  if (!entries.data?.length) return <div className="muted">無明細</div>;

  return (
    <div className="list" style={{ background: "var(--surface)" }}>
      {entries.data.map((e) => {
        const positive = isPositiveLedgerKind(e.kind as LoanLedgerKind);
        return (
          <div className="row" key={e.id}>
            <div className="meta">
              <span className="primary">
                {LOAN_LEDGER_KIND_LABELS[e.kind as LoanLedgerKind]}
                <span className="secondary" style={{ marginLeft: 8 }}>
                  {e.occurredAt}
                </span>
              </span>
              {e.note && <span className="secondary">{e.note}</span>}
            </div>
            <div className="row-inline">
              <Amount
                value={e.amountMinor}
                currency={e.currency}
                kind={positive ? "income" : "expense"}
                signed
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (confirm("刪除這筆？")) remove.mutate({ id: e.id });
                }}
              >
                刪除
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
