"use client";

import { Amount } from "@/components/Amount";
import { DonutChart, LineChart } from "@/components/Charts";
import { Skeleton, SkeletonCard, SkeletonList } from "@/components/Skeleton";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { fmt, toMajor } from "@/lib/format";
import { accountSideLabel } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Renders a colored MoM or YoY delta badge. */
function DeltaBadge({
  deltaMinor,
  deltaPct,
  currency,
  label,
}: {
  deltaMinor: bigint;
  deltaPct: number | null;
  currency: string;
  label: string;
}) {
  const isPositive = deltaMinor >= 0n;
  const arrow = isPositive ? "▲" : "▼";
  const colorClass = isPositive ? "income" : "expense";
  const pctStr = deltaPct != null ? ` (${isPositive ? "+" : ""}${deltaPct.toFixed(1)}%)` : "";

  return (
    <span className={colorClass} style={{ fontSize: 13, display: "inline-flex", gap: 4, alignItems: "center" }}>
      <span>{arrow}</span>
      <span>
        {isPositive ? "+" : ""}
        {fmt(deltaMinor, currency)}
        {pctStr}
      </span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </span>
  );
}

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
  const deltas = trpc.netWorth.deltas.useQuery(undefined, {
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container">
          <Skeleton width={120} height={28} style={{ marginBottom: 20 }} />
          <div className="grid cols-2" style={{ gap: 20 }}>
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div style={{ marginTop: 24 }}>
            <SkeletonList rows={4} />
          </div>
        </div>
      </>
    );
  }

  const data = summary.data;
  const base = data?.baseCurrency ?? "TWD";
  const deltaData = deltas.data;
  const deltaCurrency = deltaData?.currency ?? base;

  // Build detailed asset allocation segments from accounts + holdings
  const allocationSegments = (() => {
    if (!data) return null;

    // Cash, bank, and liabilities split by TWD vs foreign currency
    let twdCash = 0n;
    let foreignCash = 0n;
    let twdLiabilities = 0n;
    let foreignLiabilities = 0n;
    
    for (const acct of data.accounts) {
      if (acct.currency.toUpperCase() === base) {
        if (acct.isLiability) twdLiabilities += acct.netMinorBase;
        else twdCash += acct.netMinorBase;
      } else {
        if (acct.isLiability) foreignLiabilities += acct.netMinorBase;
        else foreignCash += acct.netMinorBase;
      }
    }

    // Holdings split by market (TW vs US)
    let twStocks = 0n;
    let usStocks = 0n;
    for (const h of data.holdings) {
      if (h.marketValueBaseMinor == null) continue;
      if (h.market === "TW") {
        twStocks += h.marketValueBaseMinor;
      } else {
        usStocks += h.marketValueBaseMinor;
      }
    }

    const liabilities = twdLiabilities + foreignLiabilities;
    const total = twdCash + foreignCash + twStocks + usStocks;

    return {
      twdCash,
      foreignCash,
      twStocks,
      usStocks,
      twdLiabilities,
      foreignLiabilities,
      liabilities,
      total,
      segments: [
        { label: `${base} 現金`, value: toMajor(twdCash, base), color: "var(--accent)" },
        { label: "外幣現金", value: toMajor(foreignCash, base), color: "#60b4ff" },
        { label: "台股", value: toMajor(twStocks, base), color: "var(--income)" },
        { label: "美股", value: toMajor(usStocks, base), color: "#b18cff" },
        { label: "負債", value: toMajor(liabilities, base), color: "var(--expense)" },
      ],
    };
  })();

  const netBaseMinor = allocationSegments ? (allocationSegments.twdCash + allocationSegments.twStocks - allocationSegments.twdLiabilities) : 0n;
  const netForeignMinor = allocationSegments ? (allocationSegments.foreignCash + allocationSegments.usStocks - allocationSegments.foreignLiabilities) : 0n;

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
            {/* ── Hero: total + MoM/YoY delta ── */}
            <div className="card hero">
              <h3>總淨值</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span className="muted" style={{ fontSize: 16 }}>{base}</span>
                  <Amount value={netBaseMinor} currency={base} kind="auto" variant="stat" />
                </div>
                {netForeignMinor !== 0n && (
                  <>
                    <span className="muted" style={{ fontSize: 20 }}>+</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span className="muted" style={{ fontSize: 14 }}>外幣等值 ≈</span>
                      <Amount value={netForeignMinor} currency={base} kind="auto" variant="stat" />
                    </div>
                  </>
                )}
              </div>
              <div className="secondary" style={{ marginTop: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span className="income">
                  資產 <Amount value={data.assetsMinor} currency={base} kind="income" variant="inline" />
                </span>
                <span className="expense">
                  負債 <Amount value={data.liabilitiesMinor} currency={base} kind="expense" variant="inline" />
                </span>
              </div>
              {/* MoM / YoY delta row */}
              {deltaData && (deltaData.mom || deltaData.yoy) && (
                <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {deltaData.mom && (
                    <DeltaBadge
                      deltaMinor={deltaData.mom.deltaMinor}
                      deltaPct={deltaData.mom.deltaPct}
                      currency={deltaCurrency}
                      label="月增"
                    />
                  )}
                  {deltaData.yoy && (
                    <DeltaBadge
                      deltaMinor={deltaData.yoy.deltaMinor}
                      deltaPct={deltaData.yoy.deltaPct}
                      currency={deltaCurrency}
                      label="年增"
                    />
                  )}
                  {!deltaData.mom && !deltaData.yoy && (
                    <span className="muted" style={{ fontSize: 12 }}>快照累積中，30 天後可見月增趨勢</span>
                  )}
                </div>
              )}
              {deltas.isLoading && (
                <Skeleton width={200} height={18} style={{ marginTop: 12 }} />
              )}
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
              <div className="card" style={{ flex: 1, minWidth: 280 }}>
                <h3>資產配置</h3>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {allocationSegments?.segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color }} />
                          <span style={{ fontSize: 14 }}>{s.label}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(BigInt(Math.round(s.value * 100)), base)}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {((s.value / (toMajor(allocationSegments.total + allocationSegments.liabilities, base))) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
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
