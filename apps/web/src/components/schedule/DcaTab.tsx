"use client";

import { EditableRow } from "@/components/schedule/EditableRow";
import { AccountOptions } from "@/components/AccountOptions";
import { AmountInput } from "@/components/AmountInput";
import { trpc } from "@/lib/trpc";
import { fmt } from "@/lib/format";
import { todayIso } from "@/lib/labels";
import { useEffect, useState } from "react";
import { niceConfirm } from "@/lib/confirm";
import { SkeletonList } from "@/components/Skeleton";

type DcaScheduleRow = {
  id: string;
  name: string;
  accountId: string;
  brokerAccountId: string | null;
  symbol: string;
  market: "TW" | "US";
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  nextRunDate: string;
  active: boolean;
};

export function DcaTab() {
  const utils = trpc.useUtils();
  const list = trpc.dca.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [brokerAccountId, setBrokerAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [market, setMarket] = useState<"TW" | "US">("US");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TWD");
  const [dayOfMonth, setDayOfMonth] = useState("6");
  const [startDate, setStartDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.dca.list.invalidate(),
      utils.forecast.projection.invalidate(),
      utils.holdings.list.invalidate(),
      utils.accounts.listWithBalances.invalidate(),
    ]);

  const create = trpc.dca.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setSymbol("");
      setAmount("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const update = trpc.dca.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });

  const remove = trpc.dca.remove.useMutation({
    onSuccess: invalidate,
  });

  // Default accounts
  useEffect(() => {
    const list = accounts.data;
    if (list && list.length > 0) {
      if (!accountId) {
        const bank = list.find(a => a.type === "bank" || a.type === "wallet");
        if (bank) {
          setAccountId(bank.id);
          setCurrency(bank.currency);
        } else {
          const first = list[0];
          if (first) {
            setAccountId(first.id);
            setCurrency(first.currency);
          }
        }
      }
      if (!brokerAccountId) {
        const broker = list.find(a => a.type === "broker");
        if (broker) setBrokerAccountId(broker.id);
      }
    }
  }, [accounts.data, accountId, brokerAccountId]);

  if (list.isLoading) return <SkeletonList rows={3} />;

  const items = list.data ?? [];

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        設定股票或 ETF 定期定額扣款計畫。時間到時會自動從指定銀行帳戶扣款，並依照當日市場歷史價格折算股數存入證券帳戶，自動計算持有均價。
      </p>

      <form
        className="card animate-fade-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name || !accountId || !symbol || !amount) return;
          create.mutate({
            name,
            accountId,
            brokerAccountId: brokerAccountId || undefined,
            symbol,
            market,
            amount,
            currency,
            dayOfMonth: Number(dayOfMonth) || 6,
            startDate,
          });
        }}
      >
        <h3 style={{ marginTop: 0 }}>建立定期定額計畫</h3>
        <div className="grid cols-3">
          <label>
            計畫名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 每月定投台積電" />
          </label>
          <label>
            股票標的代號
            <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="例: 2330 或 VOO" />
          </label>
          <label>
            交易市場
            <select value={market} onChange={(e) => setMarket(e.target.value as "TW" | "US")}>
              <option value="US">美國股市 (US)</option>
              <option value="TW">台灣股市 (TW)</option>
            </select>
          </label>
        </div>

        <div className="grid cols-3">
          <label>
            扣款帳戶 (銀行)
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const acct = accounts.data?.find(a => a.id === e.target.value);
                if (acct) setCurrency(acct.currency);
              }}
            >
              <AccountOptions accounts={accounts.data ?? []} />
            </select>
          </label>
          <label>
            存入證券帳戶
            <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
              <option value="">與扣款帳戶相同</option>
              <AccountOptions accounts={(accounts.data ?? []).filter(a => a.type === "broker")} />
            </select>
          </label>
          <label>
            扣款幣別
            <span style={{ display: "block", padding: "8px 0", fontSize: "14px", fontWeight: "bold" }}>
              {currency}
            </span>
          </label>
        </div>

        <div className="grid cols-3">
          <label>
            扣款金額 (每次)
            <AmountInput required value={amount} onChange={setAmount} placeholder="3000" />
          </label>
          <label>
            每月扣款日
            <input inputMode="numeric" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="6" />
          </label>
          <label>
            首次扣款基準日
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>

        {error && <div className="error-message" style={{ color: "var(--expense)", fontSize: 13, marginTop: 8 }}>{error}</div>}

        <div style={{ marginTop: 12 }}>
          <button className="btn" type="submit" disabled={create.isPending}>
            {create.isPending ? "新增中…" : "新增定期定額"}
          </button>
        </div>
      </form>

      <div className="section-title">執行中定期定額計畫 ({items.length})</div>

      {items.length === 0 ? (
        <div className="card muted" style={{ textAlign: "center", padding: "40px 20px" }}>
          目前尚無定期定額排程。
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {items.map((item) => (
            <DcaItem
              key={item.id}
              item={item}
              accounts={accounts.data ?? []}
              editing={editingId === item.id}
              onEdit={() => setEditingId(item.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: item.id, ...patch })}
              onToggleActive={(active) => update.mutate({ id: item.id, active })}
              onDelete={async () => {
                const ok = await niceConfirm("刪除定期定額", `確定要刪除「${item.name}」計畫嗎？`, "danger");
                if (ok) {
                  remove.mutate({ id: item.id });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DcaItem({
  item,
  accounts,
  editing,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
}: {
  item: DcaScheduleRow;
  accounts: { id: string; name: string; type: string; currency: string }[];
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: { name: string; accountId: string; brokerAccountId: string | null; amount: string }) => void;
  onToggleActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [accountId, setAccountId] = useState(item.accountId);
  const [brokerAccountId, setBrokerAccountId] = useState(item.brokerAccountId ?? "");
  const [amount, setAmount] = useState(String(Number(item.amountMinor) / 100));

  useEffect(() => {
    if (editing) {
      setName(item.name);
      setAccountId(item.accountId);
      setBrokerAccountId(item.brokerAccountId ?? "");
      setAmount(String(Number(item.amountMinor) / 100));
    }
  }, [editing, item]);

  const bank = accounts.find((a) => a.id === item.accountId);
  const broker = accounts.find((a) => a.id === item.brokerAccountId);

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={item.active}
      onToggleActive={() => onToggleActive(!item.active)}
      primary={
        <>
          {item.name}
          <span className="badge" style={{ background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
            {item.symbol} ({item.market})
          </span>
          {!item.active && <span className="badge muted-badge">已暫停</span>}
        </>
      }
      secondary={
        <>
          扣款帳戶：{bank?.name} · 存入：{broker?.name ?? "同扣款帳戶"} ·
          每次金額：<strong style={{ color: "var(--text)" }}>{fmt(item.amountMinor, item.currency)}</strong> ·
          每月扣款 · 下次執行：{item.nextRunDate?.slice(0, 7)}
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            accountId,
            brokerAccountId: brokerAccountId || null,
            amount,
          });
        }}
      >
        <div className="grid cols-2">
          <label>
            計畫名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            扣款金額 ({item.currency})
            <AmountInput required value={amount} onChange={setAmount} />
          </label>
        </div>
        <div className="grid cols-2">
          <label>
            扣款帳戶
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <AccountOptions accounts={accounts} />
            </select>
          </label>
          <label>
            存入證券帳戶
            <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
              <option value="">與扣款帳戶相同</option>
              <AccountOptions accounts={accounts.filter(a => a.type === "broker")} />
            </select>
          </label>
        </div>
        <div className="row-inline" style={{ marginTop: 12 }}>
          <button className="btn" type="submit">
            儲存
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </EditableRow>
  );
}
