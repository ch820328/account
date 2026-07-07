"use client";

import { Amount } from "@/components/Amount";
import { DonutChart, LineChart } from "@/components/Charts";
import { SkeletonCard } from "@/components/Skeleton";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { toMajor } from "@/lib/format";
import { accountSideLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function NetWorthPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const summary = trpc.netWorth.summary.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const history = trpc.netWorth.history.useQuery(
    { days: 365 },
    { enabled: !!session?.user },
  );

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

  const data = summary.data;
  const base = data?.baseCurrency ?? "TWD";

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ margin: "0 0 4px" }}>淨資產</h2>
        <p className="muted" style={{ margin: "0 0 20px", fontSize: 14 }}>
          資產 − 負債，換算為 {base}
        </p>

        {summary.isLoading ? (
          <div className="grid cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : data ? (
          <>
            <div className="card hero">
              <h3>總淨值</h3>
              <Amount value={data.totalMinor} currency={base} kind="auto" variant="stat" />
              <div className="secondary" style={{ marginTop: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span className="income">
                  資產 <Amount value={data.assetsMinor} currency={base} kind="income" variant="inline" />
                </span>
                <span className="expense">
                  負債 <Amount value={data.liabilitiesMinor} currency={base} kind="expense" variant="inline" />
                </span>
              </div>
            </div>

            <div className="grid cols-2" style={{ marginTop: 16 }}>
              <div className="card">
                <h3>淨資產趨勢</h3>
                {history.data && history.data.length >= 2 ? (
                  <LineChart
                    points={history.data.map((h) => ({
                      label: h.asOf.slice(5),
                      value: toMajor(h.totalMinor, base),
                    }))}
                    currency={base}
                    color="var(--income)"
                  />
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    每日會自動記錄一次快照，累積後即可看到趨勢曲線。
                  </div>
                )}
              </div>
              <div className="card">
                <h3>資產配置</h3>
                <DonutChart
                  segments={[
                    {
                      label: "現金／銀行",
                      value: toMajor(data.cashAndBankMinor, base),
                      color: "var(--accent)",
                    },
                    {
                      label: "投資",
                      value: toMajor(data.investmentsMinor, base),
                      color: "var(--income)",
                    },
                    {
                      label: "其他資產",
                      value: Math.max(
                        0,
                        toMajor(data.assetsMinor - data.cashAndBankMinor - data.investmentsMinor, base),
                      ),
                      color: "#b18cff",
                    },
                    {
                      label: "負債",
                      value: toMajor(data.liabilitiesMinor, base),
                      color: "var(--expense)",
                    },
                  ]}
                />
              </div>
            </div>

            <div className="grid cols-3" style={{ marginTop: 16 }}>
              <div className="card">
                <h3>現金／銀行</h3>
                <Amount value={data.cashAndBankMinor} currency={base} kind="income" variant="stat" />
              </div>
              <div className="card">
                <h3>投資市值</h3>
                <Amount value={data.investmentsMinor} currency={base} kind="income" variant="stat" />
              </div>
              <div className="card">
                <h3>本月預估淨流</h3>
                <Amount
                  value={data.monthlyCashflow.reduce(
                    (s: bigint, c: { netBaseMinor: bigint }) => s + c.netBaseMinor,
                    0n,
                  )}
                  currency={base}
                  kind="auto"
                  signed
                  variant="stat"
                />
              </div>
            </div>

            <div className="section-title">帳戶餘額</div>
            <div className="list">
              {data.accounts.map((a) => (
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

            {data.holdings.length > 0 && (
              <>
                <div className="section-title">持股</div>
                <div className="list">
                  {data.holdings.map((h) => (
                    <div className="row" key={h.id}>
                      <div className="meta">
                        <span className="primary">
                          {h.symbol} · {h.name}
                        </span>
                        <span className="secondary">{h.quantity} 股</span>
                      </div>
                      {h.marketValueMinor != null ? (
                        <Amount value={h.marketValueMinor} currency={h.currency} kind="income" />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="muted">無法載入。</div>
        )}
      </div>
    </>
  );
}
