"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import {
  ACCOUNT_SIDES,
  accountSideLabel,
  defaultTypeForSide,
  SUPPORTED_CURRENCIES,
} from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AccountsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const accounts = trpc.accounts.listWithBalances.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const [name, setName] = useState("");
  const [side, setSide] = useState<"asset" | "liability">("asset");
  const [currency, setCurrency] = useState("TWD");
  const [openingBalance, setOpeningBalance] = useState("");
  const [loanRate, setLoanRate] = useState("");
  const [loanTerm, setLoanTerm] = useState("");
  const [loanStart, setLoanStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.accounts.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.accounts.listWithBalances.invalidate(),
        utils.accounts.list.invalidate(),
        utils.netWorth.summary.invalidate(),
      ]);
      setName("");
      setOpeningBalance("");
      setLoanRate("");
      setLoanTerm("");
      setLoanStart("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const archive = trpc.accounts.archive.useMutation({
    onSuccess: async () => {
      await utils.accounts.listWithBalances.invalidate();
      utils.netWorth.summary.invalidate();
    },
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>帳戶</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          錢在哪裡：銀行、現金、信用卡、貸款等。設定目前餘額作為起點。
        </p>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate({
              name,
              side,
              type: defaultTypeForSide(side),
              currency,
              openingBalance: openingBalance || undefined,
              loanRateAnnual: side === "liability" && loanRate ? loanRate : undefined,
              loanTermMonths: side === "liability" && loanTerm ? Number(loanTerm) : undefined,
              loanStartDate: side === "liability" && loanStart ? loanStart : undefined,
            });
          }}
        >
          <div className="seg">
            {ACCOUNT_SIDES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={side === s.value ? "active" : ""}
                onClick={() => setSide(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid cols-3">
            <label>
              名稱
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={side === "asset" ? "台新薪轉" : "房貸"}
              />
            </label>
            <label>
              幣別
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              目前餘額{side === "liability" ? "（欠款）" : ""}
              <input
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          {side === "liability" && (
            <div className="grid cols-3">
              <label>
                年利率 %（選填）
                <input inputMode="decimal" value={loanRate} onChange={(e) => setLoanRate(e.target.value)} />
              </label>
              <label>
                期數／月（選填）
                <input inputMode="numeric" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} />
              </label>
              <label>
                起貸日（選填）
                <input type="date" value={loanStart} onChange={(e) => setLoanStart(e.target.value)} />
              </label>
            </div>
          )}

          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增帳戶"}
          </button>
        </form>

        <div className="section-title">我的帳戶</div>
        {accounts.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !accounts.data?.length ? (
          <div className="muted">尚無帳戶。</div>
        ) : (
          <div className="list">
            {accounts.data.map((a) => (
              <div className="row" key={a.accountId}>
                <div className="meta">
                  <span className="primary">
                    {a.name}
                    <span className="badge">{accountSideLabel(a.isLiability)}</span>
                  </span>
                  <span className="secondary">
                    {a.currency}
                    {a.loanRateAnnual ? ` · ${a.loanRateAnnual}%` : ""}
                  </span>
                </div>
                <div className="row-inline">
                  <Amount
                    value={a.balanceMinor}
                    currency={a.currency}
                    kind={a.isLiability ? "expense" : "income"}
                    signed={a.isLiability}
                  />
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      if (confirm(`封存「${a.name}」？`)) archive.mutate({ id: a.accountId });
                    }}
                  >
                    封存
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
