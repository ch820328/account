"use client";

import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/labels";
import { useEffect, useState } from "react";

export function RsuTab() {
  const utils = trpc.useUtils();
  const grants = trpc.rsu.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"TW" | "US">("US");
  const [brokerAccountId, setBrokerAccountId] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [startDate, setStartDate] = useState(todayIso().slice(0, 7) + "-01");
  const [periods, setPeriods] = useState("48");
  const [error, setError] = useState<string | null>(null);

  const preview = trpc.rsu.preview.useQuery(
    {
      totalQuantity: totalQuantity || "0",
      startDate,
      periods: Number(periods) || 48,
    },
    { enabled: Number(totalQuantity) > 0 },
  );

  const create = trpc.rsu.create.useMutation({
    onSuccess: async () => {
      await utils.rsu.list.invalidate();
      setName("");
      setSymbol("");
      setTotalQuantity("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const setActive = trpc.rsu.setActive.useMutation({
    onSuccess: () => utils.rsu.list.invalidate(),
  });
  const remove = trpc.rsu.delete.useMutation({
    onSuccess: () => utils.rsu.list.invalidate(),
  });

  useEffect(() => {
    const broker = accounts.data?.find((a) => a.type === "broker");
    if (!brokerAccountId && broker) setBrokerAccountId(broker.id);
  }, [accounts.data, brokerAccountId]);

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        新增 RSU 授予：自動拆成 48 期（可改），每期股數無條件進位，到期加入持股。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate({
            name: name || `${symbol} RSU`,
            symbol,
            market,
            brokerAccountId: brokerAccountId || undefined,
            totalQuantity,
            startDate,
            periods: Number(periods) || 48,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="2024 RSU" />
          </label>
          <label>
            股票代號
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" />
          </label>
          <label>
            市場
            <select value={market} onChange={(e) => setMarket(e.target.value as "TW" | "US")}>
              <option value="US">US</option>
              <option value="TW">TW</option>
            </select>
          </label>
        </div>
        <div className="grid cols-3">
          <label>
            總股數
            <input
              required
              inputMode="decimal"
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(e.target.value)}
              placeholder="480"
            />
          </label>
          <label>
            開始領取月份
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label>
            期數（月）
            <input
              inputMode="numeric"
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
            />
          </label>
        </div>
        <label>
          入帳證券戶（選填）
          <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
            <option value="">不指定</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        {preview.data && preview.data.length > 0 && (
          <div className="card" style={{ background: "var(--surface-2)", fontSize: 13 }}>
            <div className="muted" style={{ marginBottom: 8 }}>
              預覽前 6 期（共 {preview.data.length} 期，合計{" "}
              {preview.data.reduce((s, v) => s + Number(v.quantity), 0)} 股）
            </div>
            {preview.data.slice(0, 6).map((v) => (
              <div key={v.periodIndex}>
                第 {v.periodIndex} 期 · {v.vestDate} · {v.quantity} 股
              </div>
            ))}
            {preview.data.length > 6 && <div className="muted">…</div>}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={create.isPending || !symbol || !totalQuantity}>
          {create.isPending ? "建立中…" : "新增 RSU 授予"}
        </button>
      </form>

      <div className="section-title">RSU 授予</div>
      {grants.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !grants.data?.length ? (
        <div className="muted">尚無 RSU。</div>
      ) : (
        <div className="list">
          {grants.data.map((g) => (
            <div className="row" key={g.id}>
              <div className="meta">
                <span className="primary">
                  {g.name}
                  <span className="badge">{g.symbol}</span>
                  {!g.active && <span className="badge muted-badge">已暫停</span>}
                </span>
                <span className="secondary">
                  共 {g.totalQuantity} 股 · {g.periods} 期 · 已領 {g.vestedCount} 期
                  {g.nextVest ? ` · 下次 ${g.nextVest.vestDate}（${g.nextVest.quantity} 股）` : " · 已完成"}
                </span>
              </div>
              <div className="row-inline">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setActive.mutate({ id: g.id, active: !g.active })}
                >
                  {g.active ? "暫停" : "啟用"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    if (confirm(`刪除「${g.name}」？`)) remove.mutate({ id: g.id });
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
