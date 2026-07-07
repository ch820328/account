"use client";

import { EditableRow } from "@/components/schedule/EditableRow";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/labels";
import { useEffect, useState } from "react";

type GrantRow = {
  id: string;
  name: string;
  symbol: string;
  market: "TW" | "US";
  brokerAccountId: string | null;
  totalQuantity: string;
  startDate: string;
  periods: number;
  sellToCoverPct: string;
  active: boolean;
  vestedCount: number;
  nextVest: { vestDate: string; quantity: string } | null;
};

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
  const [sellToCoverPct, setSellToCoverPct] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const preview = trpc.rsu.preview.useQuery(
    {
      totalQuantity: totalQuantity || "0",
      startDate,
      periods: Number(periods) || 48,
    },
    { enabled: Number(totalQuantity) > 0 },
  );

  const invalidate = () =>
    Promise.all([utils.rsu.list.invalidate(), utils.forecast.projection.invalidate()]);

  const create = trpc.rsu.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setSymbol("");
      setTotalQuantity("");
      setSellToCoverPct("0");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const update = trpc.rsu.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.rsu.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.rsu.delete.useMutation({ onSuccess: invalidate });

  useEffect(() => {
    const broker = accounts.data?.find((a) => a.type === "broker");
    if (!brokerAccountId && broker) setBrokerAccountId(broker.id);
  }, [accounts.data, brokerAccountId]);

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        新增 RSU 授予：自動拆成 48 期（可改），每期到期加入持股。若公司會自動賣股繳稅
        （sell-to-cover），填「賣股繳稅比例 %」，系統只會把稅後實得的股數計入持股與預估。
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
            sellToCoverPct: Number(sellToCoverPct) || 0,
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
        <div className="grid cols-2">
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
          <label>
            賣股繳稅比例 %（sell-to-cover）
            <input
              inputMode="decimal"
              value={sellToCoverPct}
              onChange={(e) => setSellToCoverPct(e.target.value)}
              placeholder="例如 40"
            />
          </label>
        </div>

        {preview.data && preview.data.length > 0 && (
          <div className="card" style={{ background: "var(--surface-2)", fontSize: 13 }}>
            <div className="muted" style={{ marginBottom: 8 }}>
              預覽前 6 期（共 {preview.data.length} 期，總授予{" "}
              {preview.data.reduce((s, v) => s + Number(v.quantity), 0)} 股
              {Number(sellToCoverPct) > 0 && (
                <>
                  ，扣 {sellToCoverPct}% 稅後實得約{" "}
                  {Math.round(
                    preview.data.reduce((s, v) => s + Number(v.quantity), 0) *
                      (1 - (Number(sellToCoverPct) || 0) / 100),
                  )}{" "}
                  股
                </>
              )}
              ）
            </div>
            {preview.data.slice(0, 6).map((v) => (
              <div key={v.periodIndex}>
                第 {v.periodIndex} 期 · {v.vestDate} · 授予 {v.quantity} 股
                {Number(sellToCoverPct) > 0 && (
                  <span className="muted">
                    {" "}
                    → 實得 {(Number(v.quantity) * (1 - (Number(sellToCoverPct) || 0) / 100)).toFixed(2)} 股
                  </span>
                )}
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
          {(grants.data as GrantRow[]).map((g) => (
            <RsuItem
              key={g.id}
              g={g}
              accounts={accounts.data ?? []}
              editing={editingId === g.id}
              saving={update.isPending && editingId === g.id}
              onEdit={() => setEditingId(g.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: g.id, ...patch })}
              onToggleActive={() => setActive.mutate({ id: g.id, active: !g.active })}
              onDelete={() => {
                if (confirm(`刪除「${g.name}」？`)) remove.mutate({ id: g.id });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RsuItem({
  g,
  accounts,
  editing,
  saving,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
}: {
  g: GrantRow;
  accounts: { id: string; name: string; type: string }[];
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    symbol: string;
    market: "TW" | "US";
    brokerAccountId: string | null;
    totalQuantity: string;
    startDate: string;
    periods: number;
    sellToCoverPct: number;
  }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const locked = g.vestedCount > 0;
  const [name, setName] = useState(g.name);
  const [symbol, setSymbol] = useState(g.symbol);
  const [market, setMarket] = useState<"TW" | "US">(g.market);
  const [brokerAccountId, setBrokerAccountId] = useState(g.brokerAccountId ?? "");
  const [totalQuantity, setTotalQuantity] = useState(g.totalQuantity);
  const [startDate, setStartDate] = useState(g.startDate);
  const [periods, setPeriods] = useState(String(g.periods));
  const [sellToCoverPct, setSellToCoverPct] = useState(String(Number(g.sellToCoverPct)));

  useEffect(() => {
    if (editing) {
      setName(g.name);
      setSymbol(g.symbol);
      setMarket(g.market);
      setBrokerAccountId(g.brokerAccountId ?? "");
      setTotalQuantity(g.totalQuantity);
      setStartDate(g.startDate);
      setPeriods(String(g.periods));
      setSellToCoverPct(String(Number(g.sellToCoverPct)));
    }
  }, [editing, g]);

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={g.active}
      onToggleActive={onToggleActive}
      primary={
        <>
          {g.name}
          <span className="badge">{g.symbol}</span>
          {!g.active && <span className="badge muted-badge">已暫停</span>}
        </>
      }
      secondary={
        <>
          共 {g.totalQuantity} 股 · {g.periods} 期 · 已領 {g.vestedCount} 期
          {Number(g.sellToCoverPct) > 0 ? ` · 賣股繳稅 ${Number(g.sellToCoverPct)}%` : ""}
          {g.nextVest ? ` · 下次 ${g.nextVest.vestDate}（${g.nextVest.quantity} 股）` : " · 已完成"}
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            symbol,
            market,
            brokerAccountId: brokerAccountId || null,
            totalQuantity,
            startDate,
            periods: Number(periods),
            sellToCoverPct: Number(sellToCoverPct) || 0,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            股票代號
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} />
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
              disabled={locked}
            />
          </label>
          <label>
            開始領取月份
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={locked}
            />
          </label>
          <label>
            期數（月）
            <input
              inputMode="numeric"
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
              disabled={locked}
            />
          </label>
        </div>
        <div className="grid cols-2">
          <label>
            入帳證券戶（選填）
            <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
              <option value="">不指定</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            賣股繳稅比例 %
            <input
              inputMode="decimal"
              value={sellToCoverPct}
              onChange={(e) => setSellToCoverPct(e.target.value)}
            />
          </label>
        </div>
        {locked && (
          <div className="muted" style={{ fontSize: 12 }}>
            已有入帳期數，股數／期數／開始月份無法修改。
          </div>
        )}
        <div className="row-inline">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </EditableRow>
  );
}
