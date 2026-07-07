"use client";

import { Amount } from "@/components/Amount";
import { QuickEntry } from "@/components/QuickEntry";
import { SkeletonCard, SkeletonList } from "@/components/Skeleton";
import { TopBar } from "@/components/TopBar";
import { TransactionList } from "@/components/TransactionList";
import { useSession } from "@/lib/auth-client";
import { fmt } from "@/lib/format";
import { accountSideLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function ExpenseBar({
  label,
  value,
  total,
  currency,
}: {
  label: string;
  value: bigint;
  total: bigint;
  currency: string;
}) {
  const pct = total > 0n ? Number((value * 100n) / total) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row-inline" style={{ justifyContent: "space-between", fontSize: 13 }}>
        <span>{label}</span>
        <span className="expense" style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmt(value, currency)}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [quickOpen, setQuickOpen] = useState(false);

  const breakdown = trpc.transactions.monthlyBreakdown.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const recent = trpc.transactions.list.useQuery({ limit: 10 }, { enabled: !!session?.user });
  const netWorth = trpc.netWorth.summary.useQuery(undefined, { enabled: !!session?.user });
  const upcoming = trpc.transactions.upcoming.useQuery({ days: 30 }, { enabled: !!session?.user });
  const balances = trpc.accounts.listWithBalances.useQuery(undefined, {
    enabled: !!session?.user,
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

  const base = netWorth.data?.baseCurrency ?? "TWD";

  return (
    <>
      <TopBar />
      <div className="container">
        <div className="row-inline" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>本月記帳</h2>
          <button className="btn" onClick={() => setQuickOpen((v) => !v)}>
            {quickOpen ? "收合" : "+ 記錄"}
          </button>
        </div>

        {quickOpen && (
          <div style={{ marginBottom: 20 }}>
            <QuickEntry onDone={() => setQuickOpen(false)} />
          </div>
        )}

        <div className="grid cols-3">
          {netWorth.isLoading ? (
            <SkeletonCard />
          ) : (
            <div className="card">
              <h3>現金資產</h3>
              <Amount
                value={netWorth.data?.cashAndBankMinor ?? 0n}
                currency={base}
                kind="income"
                variant="stat"
              />
              <div className="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                銀行＋現金＋錢包
              </div>
            </div>
          )}

          {breakdown.isLoading ? (
            <SkeletonCard />
          ) : (
            <div className="card">
              <h3>本月收入</h3>
              <Amount
                value={breakdown.data?.incomeMinor ?? 0n}
                currency={base}
                kind="income"
                variant="stat"
              />
            </div>
          )}

          {netWorth.data && (
            <Link href="/net-worth" className="card card-link">
              <h3>淨資產 · {base}</h3>
              <Amount value={netWorth.data.totalMinor} currency={base} kind="auto" variant="stat" />
              <div className="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                查看資產負債明細 →
              </div>
            </Link>
          )}
        </div>

        {breakdown.data && (
          <>
            <div className="section-title">本月支出分項</div>
            <div className="card">
              <div className="row-inline" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <span className="primary">本月支出合計</span>
                <Amount value={breakdown.data.expenseMinor} currency={base} kind="expense" signed />
              </div>
              <ExpenseBar
                label="生活開銷"
                value={breakdown.data.living}
                total={breakdown.data.expenseMinor}
                currency={base}
              />
              <ExpenseBar
                label="分期"
                value={breakdown.data.installment}
                total={breakdown.data.expenseMinor}
                currency={base}
              />
              <ExpenseBar
                label="固定支出"
                value={breakdown.data.recurring}
                total={breakdown.data.expenseMinor}
                currency={base}
              />
              {breakdown.data.payroll > 0n && (
                <ExpenseBar
                  label="薪資扣款"
                  value={breakdown.data.payroll}
                  total={breakdown.data.expenseMinor}
                  currency={base}
                />
              )}
              {breakdown.data.other > 0n && (
                <ExpenseBar
                  label="其他"
                  value={breakdown.data.other}
                  total={breakdown.data.expenseMinor}
                  currency={base}
                />
              )}
              {breakdown.data.loanTransfer > 0n && (
                <div className="row-inline" style={{ justifyContent: "space-between", marginTop: 10, fontSize: 13 }}>
                  <span className="muted">貸款還款（轉帳，不計入支出）</span>
                  <Amount value={breakdown.data.loanTransfer} currency={base} kind="neutral" />
                </div>
              )}
            </div>
          </>
        )}

        <div className="section-title">帳戶快覽</div>
        {balances.isLoading ? (
          <SkeletonList rows={3} />
        ) : !balances.data?.length ? (
          <div className="muted">
            尚無帳戶，<Link href="/accounts">新增帳戶</Link>。
          </div>
        ) : (
          <div className="list">
            {balances.data.slice(0, 6).map((a) => (
              <Link
                className="row card-link"
                key={a.accountId}
                href={`/transactions?account=${a.accountId}`}
              >
                <div className="meta">
                  <span className="primary">
                    {a.name}
                    <span className="badge">{accountSideLabel(a.isLiability)}</span>
                  </span>
                  <span className="secondary">{a.currency} · 看明細 →</span>
                </div>
                <Amount
                  value={a.balanceMinor}
                  currency={a.currency}
                  kind={a.isLiability ? "expense" : "income"}
                  signed={a.isLiability}
                />
              </Link>
            ))}
          </div>
        )}

        {upcoming.data && upcoming.data.length > 0 && (
          <>
            <div className="section-title">即將發生（30 天）</div>
            <div className="list">
              {upcoming.data.map((u, i) => (
                <div className="row" key={`${u.name}-${u.date}-${i}`}>
                  <div className="meta">
                    <span className="primary">
                      {u.name}
                      {u.note && <span className="badge muted-badge">{u.note}</span>}
                    </span>
                    <span className="secondary">{u.date}</span>
                  </div>
                  {u.kind === "rsu" ? (
                    <span className="muted">RSU 入帳</span>
                  ) : (
                    <Amount
                      value={u.amountMinor}
                      currency={u.currency}
                      kind={u.kind === "income" ? "income" : u.kind === "expense" ? "expense" : "neutral"}
                      signed={u.kind !== "transfer"}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="row-inline" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="section-title" style={{ marginBottom: 0 }}>最近記錄</div>
          <Link href="/transactions" className="secondary" style={{ fontSize: 13 }}>
            全部交易 →
          </Link>
        </div>
        <TransactionList
          data={recent.data?.items}
          loading={recent.isLoading}
          invalidate={() =>
            Promise.all([
              utils.transactions.list.invalidate(),
              utils.transactions.monthlySummary.invalidate(),
              utils.accounts.listWithBalances.invalidate(),
              utils.netWorth.summary.invalidate(),
            ])
          }
        />
      </div>
    </>
  );
}
