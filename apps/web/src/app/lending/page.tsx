"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { AccountOptions } from "@/components/AccountOptions";
import { AmountInput } from "@/components/AmountInput";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  isPositiveLedgerKind,
  LOAN_LEDGER_KIND_LABELS,
  LOAN_LEDGER_KIND_OPTIONS,
  type LoanLedgerKind,
  todayIso,
  SUPPORTED_CURRENCIES,
} from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { niceConfirm } from "@/lib/confirm";

import { LoanTab } from "@/components/schedule/LoanTab";
import { usePersistentTab } from "@/lib/use-persistent-tab";

const VALID_LENDING_TABS = ["personal", "mortgage"] as const;

export default function LendingPage() {
  const { ready } = useAuthGuard();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = usePersistentTab<"personal" | "mortgage">(
    "tab:lending",
    VALID_LENDING_TABS,
    "personal"
  );

  const summary = trpc.personalLoans.summary.useQuery(undefined, { enabled: ready });
  const accounts = trpc.accounts.list.useQuery(undefined, { enabled: ready });
  const nwSummary = trpc.netWorth.summary.useQuery(undefined, { enabled: ready });
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
  const [currency, setCurrency] = useState("");
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);

  const invalidate = () => utils.personalLoans.summary.invalidate();

  const create = trpc.personalLoans.create.useMutation({
    onSuccess: async (_data, vars) => {
      await invalidate();
      await utils.personalLoans.entries.invalidate({ counterparty: vars.counterparty });
      await utils.accounts.listWithBalances.invalidate();
      setAmount("");
      setCurrency("");
      setNote("");
      setAccountId("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  if (!ready) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} />
        </div>
      </>
    );
  }

  const base = nwSummary.data?.baseCurrency ?? "TWD";
  const activeCurrency = currency || base;

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>借貸管理</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          集中管理民間親友借貸（借出/借入）與銀行房屋貸款、利率試算及提前還本。
        </p>

        <div className="seg" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={activeTab === "personal" ? "active" : ""}
            onClick={() => setActiveTab("personal")}
          >
            🤝 民間借貸（借出 / 借入）
          </button>
          <button
            type="button"
            className={activeTab === "mortgage" ? "active" : ""}
            onClick={() => setActiveTab("mortgage")}
          >
            🏠 銀行房貸與還款試算
          </button>
        </div>

        {activeTab === "mortgage" && (
          <div>
            <LoanTab />
          </div>
        )}

        {activeTab === "personal" && (
          <div>
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
              currency: activeCurrency,
              occurredAt: date,
              note: note || undefined,
              accountId: accountId || undefined,
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
          <div className="grid cols-3">
            <label>
              金額
              <AmountInput required value={amount} onChange={setAmount} />
            </label>
            <label>
              幣別
              <select value={activeCurrency} onChange={(e) => setCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              日期
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className="grid cols-2">
            <label>
              連動帳戶
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">(無)</option>
                <AccountOptions accounts={accounts.data ?? []} />
              </select>
            </label>
            <label>
              備註
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增紀錄"}
          </button>
        </form>

        <div className="section-title">對象累計</div>
        {summary.isLoading ? (
          <SkeletonList rows={3} />
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
    )}
  </div>
</>
  );
}

function LendingEntryItem({
  e,
  counterparty,
  onChanged,
}: {
  e: any;
  counterparty: string;
  onChanged: () => Promise<unknown>;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<LoanLedgerKind>(e.kind);
  const [amount, setAmount] = useState(String(Number(e.amountMinor) / 100));
  const [occurredAt, setOccurredAt] = useState(e.occurredAt);
  const [note, setNote] = useState(e.note ?? "");

  const update = trpc.personalLoans.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.personalLoans.entries.invalidate({ counterparty }),
        utils.accounts.listWithBalances.invalidate(),
        onChanged(),
      ]);
      setEditing(false);
    },
  });

  const remove = trpc.personalLoans.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.personalLoans.entries.invalidate({ counterparty }),
        utils.accounts.listWithBalances.invalidate(),
        onChanged(),
      ]);
    },
  });

  const positive = isPositiveLedgerKind(e.kind as LoanLedgerKind);

  if (editing) {
    return (
      <form
        className="list-item editing"
        style={{ padding: 12, background: "rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", gap: 10, marginBottom: 8, borderRadius: 8 }}
        onSubmit={(evt) => {
          evt.preventDefault();
          update.mutate({
            id: e.id,
            counterparty,
            kind,
            amount,
            currency: e.currency,
            occurredAt,
            note: note || undefined,
          });
        }}
      >
        <div className="grid cols-3" style={{ gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            類型
            <select value={kind} onChange={(evt) => setKind(evt.target.value as LoanLedgerKind)}>
              {LOAN_LEDGER_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            金額
            <AmountInput required value={amount} onChange={setAmount} />
          </label>
          <label style={{ fontSize: 12 }}>
            日期
            <input type="date" value={occurredAt} onChange={(evt) => setOccurredAt(evt.target.value)} />
          </label>
        </div>
        <label style={{ fontSize: 12 }}>
          備註
          <input value={note} onChange={(evt) => setNote(evt.target.value)} placeholder="選填" />
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>
            取消
          </button>
          <button className="btn sm" disabled={update.isPending}>
            {update.isPending ? "儲存中…" : "儲存變更"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="row">
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
        <Amount value={e.amountMinor} currency={e.currency} kind={positive ? "income" : "expense"} signed />
        <button type="button" className="btn ghost sm" onClick={() => setEditing(true)}>
          編輯
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={async () => {
            const ok = await niceConfirm("刪除款項交易", "確定要刪除這筆借貸交易紀錄嗎？", "danger");
            if (ok) remove.mutate({ id: e.id });
          }}
        >
          刪除
        </button>
      </div>
    </div>
  );
}

function PersonEntries({
  counterparty,
  onChanged,
}: {
  counterparty: string;
  onChanged: () => Promise<unknown>;
}) {
  const entries = trpc.personalLoans.entries.useQuery({ counterparty });

  if (entries.isLoading) return <SkeletonList rows={3} />;
  if (!entries.data?.length) return <div className="muted">無明細</div>;

  return (
    <div className="list" style={{ background: "var(--surface)" }}>
      {entries.data.map((e) => (
        <LendingEntryItem key={e.id} e={e} counterparty={counterparty} onChanged={onChanged} />
      ))}
    </div>
  );
}
