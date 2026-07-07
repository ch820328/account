"use client";

import { Amount } from "@/components/Amount";
import { TopBar } from "@/components/TopBar";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

/** A quote is stale when it's older than 7 days. */
function isStale(priceAsOf: string | null): boolean {
  if (!priceAsOf) return false;
  const asOf = new Date(`${priceAsOf}T00:00:00`).getTime();
  return Date.now() - asOf > 7 * 24 * 60 * 60 * 1000;
}

type HoldingRow = {
  id: string;
  symbol: string;
  market: "TW" | "US";
  name: string;
  quantity: string;
  currency: string;
  accountName: string | null;
  price: string | null;
  priceAsOf: string | null;
  marketValueMinor: bigint | null;
};

export default function HoldingsPage() {
  const { ready } = useAuthGuard();
  const utils = trpc.useUtils();
  const holdings = trpc.holdings.list.useQuery(undefined, { enabled: ready });

  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"TW" | "US">("TW");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.holdings.list.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const save = trpc.holdings.saveManual.useMutation({
    onSuccess: async () => {
      await invalidate();
      setSymbol("");
      setName("");
      setQuantity("");
      setPrice("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const remove = trpc.holdings.remove.useMutation({ onSuccess: invalidate });

  if (!ready) {
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
      totalByCurrency.set(h.currency, (totalByCurrency.get(h.currency) ?? 0n) + h.marketValueMinor);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>投資持倉</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          輸入持股：代號、股數、現在價格。台股填代號（如 2330），美股填代號（如 AAPL）。
        </p>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate({ symbol, market, name: name || undefined, quantity, price });
          }}
        >
          <div className="grid cols-3">
            <label>
              市場
              <select value={market} onChange={(e) => setMarket(e.target.value as "TW" | "US")}>
                <option value="TW">台股</option>
                <option value="US">美股</option>
              </select>
            </label>
            <label>
              股票代號
              <input
                required
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={market === "TW" ? "2330" : "AAPL"}
              />
            </label>
            <label>
              名稱（選填）
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="台積電" />
            </label>
          </div>
          <div className="grid cols-2">
            <label>
              持有股數
              <input required inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label>
              現在價格（每股 {market === "TW" ? "TWD" : "USD"}）
              <input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={save.isPending}>
            {save.isPending ? "儲存中…" : "新增／更新持股"}
          </button>
        </form>

        {(holdings.data?.length ?? 0) > 0 && (
          <div className="grid cols-3" style={{ marginTop: 16, marginBottom: 8 }}>
            {[...totalByCurrency.entries()].map(([currency, total]) => (
              <div className="card" key={currency}>
                <h3>{currency} 市值</h3>
                <Amount value={total} currency={currency} kind="income" variant="stat" />
              </div>
            ))}
          </div>
        )}

        <div className="section-title">我的持股</div>
        {holdings.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !holdings.data?.length ? (
          <div className="muted">尚無持股，用上方表單新增。</div>
        ) : (
          <div className="list">
            {(holdings.data as HoldingRow[]).map((h) => (
              <HoldingItem
                key={h.id}
                h={h}
                editing={editingId === h.id}
                saving={save.isPending && editingId === h.id}
                onEdit={() => setEditingId(h.id)}
                onClose={() => setEditingId(null)}
                onSave={(patch) => {
                  save.mutate(
                    { symbol: h.symbol, market: h.market, name: h.name, ...patch },
                    { onSuccess: () => setEditingId(null) },
                  );
                }}
                onDelete={() => {
                  if (confirm(`刪除持股「${h.symbol}」？`)) remove.mutate({ id: h.id });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function HoldingItem({
  h,
  editing,
  saving,
  onEdit,
  onClose,
  onSave,
  onDelete,
}: {
  h: HoldingRow;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: { quantity: string; price: string }) => void;
  onDelete: () => void;
}) {
  const [quantity, setQuantity] = useState(h.quantity);
  const [price, setPrice] = useState(h.price ?? "");

  useEffect(() => {
    if (editing) {
      setQuantity(h.quantity);
      setPrice(h.price ?? "");
    }
  }, [editing, h]);

  return (
    <div className={`list-item${editing ? " editing" : ""}`}>
      <div className="row">
        <div className="meta">
          <span className="primary">
            {h.symbol}
            <span className="badge">{h.market === "TW" ? "台股" : "美股"}</span>
          </span>
          <span className="secondary">
            {h.name} · {h.quantity} 股 · {h.price ? `@ ${h.price}` : "無報價"}
            {h.priceAsOf ? `（${h.priceAsOf}）` : ""}
            {isStale(h.priceAsOf) && <span className="badge expense">報價過期</span>}
          </span>
        </div>
        <div className="row-inline">
          {!editing &&
            (h.marketValueMinor != null ? (
              <Amount value={h.marketValueMinor} currency={h.currency} kind="income" />
            ) : (
              <span className="muted">—</span>
            ))}
          <button type="button" className="btn ghost" onClick={() => (editing ? onClose() : onEdit())}>
            {editing ? "收合" : "編輯"}
          </button>
          {!editing && (
            <button type="button" className="btn ghost" onClick={onDelete}>
              刪除
            </button>
          )}
        </div>
      </div>
      {editing && (
        <div className="row-edit-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave({ quantity, price });
            }}
          >
            <div className="grid cols-2">
              <label>
                持有股數
                <input required inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
              <label>
                現在價格（每股 {h.currency}）
                <input required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
            </div>
            <div className="row-inline">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
