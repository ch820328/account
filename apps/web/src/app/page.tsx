"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { fmtDate } from "@/lib/format";
import { accountSideLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const monthly = trpc.transactions.monthlySummary.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const recent = trpc.transactions.list.useQuery({ limit: 10 }, { enabled: !!session?.user });
  const netWorth = trpc.netWorth.summary.useQuery(undefined, { enabled: !!session?.user });
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
          <Link className="btn" href="/entry">
            + 記一筆
          </Link>
        </div>

        <div className="grid cols-3">
          {monthly.isLoading ? (
            <div className="card muted">載入中…</div>
          ) : monthly.data && monthly.data.length > 0 ? (
            monthly.data.map((s) => (
              <div className="card" key={s.currency}>
                <h3>{s.currency} · 本月</h3>
                <Amount
                  value={s.net}
                  currency={s.currency}
                  kind="auto"
                  signed
                  variant="stat"
                />
                <div className="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                  <span className="income">
                    收 <Amount value={s.income} currency={s.currency} kind="income" variant="inline" />
                  </span>
                  {" · "}
                  <span className="expense">
                    支 <Amount value={s.expense} currency={s.currency} kind="expense" variant="inline" />
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="card muted">本月尚無記錄，點「記一筆」開始。</div>
          )}

          {netWorth.data && (
            <Link href="/net-worth" className="card card-link">
              <h3>淨資產 · {base}</h3>
              <Amount
                value={netWorth.data.totalMinor}
                currency={base}
                kind="auto"
                variant="stat"
              />
              <div className="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                查看資產負債明細 →
              </div>
            </Link>
          )}
        </div>

        <div className="section-title">帳戶快覽</div>
        {balances.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !balances.data?.length ? (
          <div className="muted">
            尚無帳戶，<Link href="/accounts">新增帳戶</Link>。
          </div>
        ) : (
          <div className="list">
            {balances.data.slice(0, 6).map((a) => (
              <div className="row" key={a.accountId}>
                <div className="meta">
                  <span className="primary">
                    {a.name}
                    <span className="badge">{accountSideLabel(a.isLiability)}</span>
                  </span>
                  <span className="secondary">{a.currency}</span>
                </div>
                <Amount
                  value={a.balanceMinor}
                  currency={a.currency}
                  kind={a.isLiability ? "expense" : "income"}
                  signed={a.isLiability}
                />
              </div>
            ))}
          </div>
        )}

        <div className="section-title">最近記錄</div>
        <RecentList data={recent.data} loading={recent.isLoading} />
      </div>
    </>
  );
}

function RecentList({
  data,
  loading,
}: {
  data:
    | {
        id: string;
        type: "income" | "expense" | "transfer";
        amountMinor: bigint;
        currency: string;
        occurredAt: Date;
        note: string | null;
        accountName: string;
        transferAccountName: string | null;
        categoryName: string | null;
      }[]
    | undefined;
  loading: boolean;
}) {
  if (loading) return <div className="muted">載入中…</div>;
  if (!data || data.length === 0) {
    return (
      <div className="muted">
        尚無記錄。<Link href="/entry">記第一筆</Link>
      </div>
    );
  }

  return (
    <div className="list">
      {data.map((t) => (
        <div className="row" key={t.id}>
          <div className="meta">
            <span className="primary">
              {t.type === "transfer"
                ? "轉帳"
                : (t.categoryName ?? (t.type === "income" ? "收入" : "支出"))}
            </span>
            <span className="secondary">
              {t.type === "transfer"
                ? `${t.accountName} → ${t.transferAccountName ?? "?"}`
                : t.accountName}{" "}
              · {fmtDate(t.occurredAt)}
              {t.note ? ` · ${t.note}` : ""}
            </span>
          </div>
          <Amount
            value={t.amountMinor}
            currency={t.currency}
            kind={
              t.type === "expense" ? "expense" : t.type === "income" ? "income" : "neutral"
            }
            signed={t.type !== "transfer"}
          />
        </div>
      ))}
    </div>
  );
}
