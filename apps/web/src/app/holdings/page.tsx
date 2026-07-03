"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HoldingsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const holdings = trpc.holdings.list.useQuery(undefined, { enabled: !!session?.user });

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

  const totalByCurrency = new Map<string, bigint>();
  for (const h of holdings.data ?? []) {
    if (h.marketValueMinor != null) {
      totalByCurrency.set(
        h.currency,
        (totalByCurrency.get(h.currency) ?? 0n) + h.marketValueMinor,
      );
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>投資持倉</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          持股由 quant 交易系統同步。有報價時自動計入總財產。
        </p>

        {holdings.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !holdings.data?.length ? (
          <div className="card muted">
            尚無持股。請從外部系統呼叫 sync API 的 syncHoldings。
          </div>
        ) : (
          <>
            <div className="grid cols-3" style={{ marginBottom: 16 }}>
              {[...totalByCurrency.entries()].map(([currency, total]) => (
                <div className="card" key={currency}>
                  <h3>{currency} 市值</h3>
                  <Amount value={total} currency={currency} kind="income" variant="stat" />
                </div>
              ))}
            </div>
            <div className="list">
              {holdings.data.map((h) => (
                <div className="row" key={h.id}>
                  <div className="meta">
                    <span className="primary">
                      {h.symbol}
                      <span className="badge">{h.market}</span>
                    </span>
                    <span className="secondary">
                      {h.name} · {h.quantity} 股
                      {h.accountName ? ` · ${h.accountName}` : ""}
                    </span>
                  </div>
                  <div className="meta" style={{ alignItems: "flex-end" }}>
                    <span className="primary">
                      {h.marketValueMinor != null ? (
                        <Amount value={h.marketValueMinor} currency={h.currency} kind="income" />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="secondary">
                      {h.price ? `@ ${h.price}` : "無報價"}
                      {h.priceAsOf ? ` (${h.priceAsOf})` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
