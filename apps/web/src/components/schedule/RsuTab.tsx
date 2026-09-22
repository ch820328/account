"use client";

import { AmountInput } from "@/components/AmountInput";
import { DatePicker } from "@/components/DatePicker";
import { EditableRow } from "@/components/schedule/EditableRow";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/labels";
import React, { useEffect, useState, useMemo } from "react";
import { niceConfirm } from "@/lib/confirm";
import { calculateVestDateIso, calculateCustomRsuVesting } from "@acc/core/rsu-math";

type GrantRow = {
  id: string;
  name: string;
  symbol: string;
  market: "TW" | "US";
  brokerAccountId: string | null;
  totalQuantity: string;
  startDate: string;
  periods: number;
  frequency?: "monthly" | "quarterly";
  estimatedPrice?: string | null;
  sellToCoverPct: string;
  active: boolean;
  vestedCount: number;
  nextVest: { vestDate: string; quantity: string } | null;
  currentPrice: string | null;
  priceCurrency: string;
  vests: {
    id: string;
    grantId: string;
    periodIndex: number;
    vestDate: string;
    quantity: string;
    status: "pending" | "vested" | "sold";
    vestPrice: string | null;
    sellToCoverPct: string | null;
    soldDate: string | null;
    soldPrice: string | null;
    soldFee: string | null;
    sells?: {
      id: string;
      soldDate: string;
      quantity: string;
      soldPrice: string;
      soldFee: string;
      receivedAmount: string;
      receivedAccountId: string;
    }[];
  }[];
};

export function RsuTab() {
  const utils = trpc.useUtils();
  const grants = trpc.rsu.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();

  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([utils.rsu.list.invalidate(), utils.forecast.projection.invalidate()]);

  const update = trpc.rsu.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.rsu.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.rsu.delete.useMutation({ onSuccess: invalidate });

  return (
    <div>
      <CustomRsuCalculator />

      <div className="section-title" style={{ marginTop: 28 }}>RSU 授予與解鎖紀錄清單</div>
      {grants.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !grants.data?.length ? (
        <div className="muted">尚無 RSU 授予計畫。</div>
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
              onDelete={async () => {
                const ok = await niceConfirm("刪除 RSU 計畫", `確定要刪除「${g.name}」計畫嗎？`, "danger");
                if (ok) remove.mutate({ id: g.id });
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
  accounts: { id: string; name: string; type: string; currency: string }[];
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    symbol: string;
    market: "TW" | "US";
    brokerAccountId: string | null;
    startDate: string;
    periods: number;
    frequency: "monthly" | "quarterly";
    estimatedPrice?: string;
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
  const [startDate, setStartDate] = useState(g.startDate);
  const [periods, setPeriods] = useState(String(g.periods));
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">(g.frequency || "monthly");
  const [estimatedPrice, setEstimatedPrice] = useState(g.estimatedPrice || "");
  const [sellToCoverPct, setSellToCoverPct] = useState(String(Number(g.sellToCoverPct)));

  const [showVests, setShowVests] = useState(true);
  const [sellingVestId, setSellingVestId] = useState<string | null>(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [soldDate, setSoldDate] = useState(todayIso());
  const [soldFee, setSoldFee] = useState("0");
  const [sellQty, setSellQty] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedAccountId, setReceivedAccountId] = useState("");

  const [editingVestId, setEditingVestId] = useState<string | null>(null);
  const [editVestQty, setEditVestQty] = useState("");
  const [editVestPrice, setEditVestPrice] = useState("");
  const [editVestCoverPct, setEditVestCoverPct] = useState("");

  const utils = trpc.useUtils();
  const invalidate = () =>
    Promise.all([
      utils.rsu.list.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
      utils.holdings.list.invalidate(),
    ]);

  const sellMutation = trpc.rsu.sellVest.useMutation({
    onSuccess: async () => {
      await invalidate();
      setSellingVestId(null);
      setSoldPrice("");
      setSoldFee("0");
      setSellQty("");
      setReceivedAmount("");
      setReceivedAccountId("");
    },
  });

  const updateVestMutation = trpc.rsu.updateVest.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingVestId(null);
      setEditVestQty("");
      setEditVestPrice("");
      setEditVestCoverPct("");
    },
  });

  useEffect(() => {
    if (editing) {
      setName(g.name);
      setSymbol(g.symbol);
      setMarket(g.market);
      setBrokerAccountId(g.brokerAccountId ?? "");
      setStartDate(g.startDate);
      setPeriods(String(g.periods));
      setFrequency(g.frequency || "monthly");
      setEstimatedPrice(g.estimatedPrice || "");
      setSellToCoverPct(String(Number(g.sellToCoverPct)));
    }
  }, [editing, g]);

  const currSign = g.priceCurrency === "USD" ? "$" : "NT$";
  const estPriceNum = Number(g.estimatedPrice) || Number(g.currentPrice) || 0;
  const totalGrantVal = Number(g.totalQuantity) * estPriceNum;

  // Calculate actual total vested income
  const totalVestedIncome = useMemo(() => {
    return g.vests.reduce((sum, v) => {
      if (v.status === "vested" || v.status === "sold") {
        const prc = Number(v.vestPrice) || estPriceNum;
        return sum + Number(v.quantity) * prc;
      }
      return sum;
    }, 0);
  }, [g.vests, estPriceNum]);

  type LocalVestDraft = {
    id: string;
    grantId: string;
    periodIndex: number;
    vestDate: string;
    quantity: string;
    status: "pending" | "vested" | "sold";
    vestPrice: string | null;
    sellToCoverPct: string | null;
    soldDate: string | null;
    soldPrice: string | null;
    soldFee: string | null;
    sells?: any[];
  };

  const [vestDrafts, setVestDrafts] = useState<LocalVestDraft[]>(g.vests);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "vested" | "sold">("all");
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    setVestDrafts(g.vests);
  }, [g.vests]);

  const batchUpdateMutation = trpc.rsu.updateVestsBatch.useMutation({
    onSuccess: async () => {
      await invalidate();
      setSaveSuccessNotice("✅ 已成功儲存所有期數的變更！");
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    },
  });

  const updateDraft = (id: string, patch: Partial<{ vestDate: string; quantity: string }>) => {
    setVestDrafts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const dirtyRowIds = useMemo(() => {
    const origMap = new Map(g.vests.map((v) => [v.id, v]));
    const set = new Set<string>();
    for (const draft of vestDrafts) {
      const orig = origMap.get(draft.id);
      if (orig && (orig.vestDate !== draft.vestDate || orig.quantity !== draft.quantity)) {
        set.add(draft.id);
      }
    }
    return set;
  }, [vestDrafts, g.vests]);

  const hasDirty = dirtyRowIds.size > 0;

  const handleSaveAllDirty = () => {
    const dirtyItems = vestDrafts.filter((v) => dirtyRowIds.has(v.id));
    if (dirtyItems.length === 0) return;
    batchUpdateMutation.mutate({
      grantId: g.id,
      vests: dirtyItems.map((v) => ({
        id: v.id,
        vestDate: v.vestDate,
        quantity: v.quantity,
      })),
    });
  };

  const handleSaveSingleRow = (vId: string) => {
    const draft = vestDrafts.find((v) => v.id === vId);
    if (!draft) return;
    updateVestMutation.mutate({
      vestId: draft.id,
      vestDate: draft.vestDate,
      quantity: draft.quantity,
    });
  };

  const handleResetDirty = () => {
    setVestDrafts(g.vests);
  };

  const filteredVests = useMemo(() => {
    if (statusFilter === "all") return vestDrafts;
    return vestDrafts.filter((v) => v.status === statusFilter);
  }, [vestDrafts, statusFilter]);

  const draftTotalShares = useMemo(() => {
    return vestDrafts.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
  }, [vestDrafts]);

  const draftTotalValuation = draftTotalShares * estPriceNum;

  return (
    <div>
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
            <span className="badge">{g.symbol} ({g.market})</span>
            <span className="badge muted-badge">{g.frequency === "quarterly" ? "按季發放" : "按月發放"}</span>
            {!g.active && <span className="badge muted-badge">已暫停</span>}
          </>
        }
        secondary={
          <>
            總計 {draftTotalShares} 股 ({g.periods} 期) · 預估總值: {currSign} {draftTotalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {totalVestedIncome > 0 ? ` · 實際已解鎖所得: ${currSign} ${totalVestedIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}
            {g.nextVest ? ` · 下次 ${g.nextVest.vestDate}（${g.nextVest.quantity} 股）` : " · 已全數解鎖"}
          </>
        }
        right={
          <button
            type="button"
            className="btn ghost"
            onClick={() => setShowVests(!showVests)}
            style={{ padding: "4px 10px", fontSize: "12px" }}
          >
            {showVests ? "收合表格明細 ▲" : "展開每期表格編輯 ▼"}
          </button>
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
              startDate,
              periods: Number(periods),
              frequency,
              estimatedPrice: estimatedPrice || undefined,
              sellToCoverPct: Number(sellToCoverPct) || 0,
            });
          }}
        >
          <div className="grid cols-3">
            <label>
              計畫名稱
              <input required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              股票代號
              <input required value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </label>
            <label>
              市場
              <select value={market} onChange={(e) => setMarket(e.target.value as "TW" | "US")}>
                <option value="US">US (美股)</option>
                <option value="TW">TW (台股)</option>
              </select>
            </label>
          </div>
          <div className="grid cols-3">
            <label>
              發放頻率
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as "monthly" | "quarterly")} disabled={locked}>
                <option value="monthly">按月 (Monthly)</option>
                <option value="quarterly">按季 (Quarterly)</option>
              </select>
            </label>
            <label>
              首次發放時間
              <div style={{ marginTop: 4 }}>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  disabled={locked}
                />
              </div>
            </label>
            <label>
              預估發放時股價 ({currSign})
              <AmountInput
                value={estimatedPrice}
                onChange={setEstimatedPrice}
                placeholder="如 185.00"
              />
            </label>
          </div>
          <div className="grid cols-2">
            <label>
              入帳證券戶（選填）
              <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
                <option value="">不指定</option>
                {accounts.filter((a) => a.type === "broker").map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
            <label>
              賣股繳稅預扣 %
              <AmountInput
                value={sellToCoverPct}
                onChange={setSellToCoverPct}
              />
            </label>
          </div>
          {locked && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              已有已入帳期數，頻率與首次日期無法修改。
            </div>
          )}
          <div className="row-inline" style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "儲存中…" : "儲存設定"}
            </button>
            <button type="button" className="btn ghost" onClick={onClose}>
              取消
            </button>
          </div>
        </form>
      </EditableRow>

      {/* Per-period Vesting Schedule Table UI */}
      {showVests && (
        <div style={{ marginTop: "14px", display: "grid", gap: "10px" }}>
          {/* Table Toolbar & Summary */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: "var(--surface-2)", padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: "bold", fontSize: 14 }}>
                📋 每一期解鎖與所得表格 (共 {vestDrafts.length} 期)
              </span>

              {/* Status filter tabs */}
              <div className="seg" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={statusFilter === "all" ? "active" : ""}
                  onClick={() => setStatusFilter("all")}
                  style={{ padding: "3px 8px", fontSize: 12 }}
                >
                  全部 ({vestDrafts.length})
                </button>
                <button
                  type="button"
                  className={statusFilter === "pending" ? "active" : ""}
                  onClick={() => setStatusFilter("pending")}
                  style={{ padding: "3px 8px", fontSize: 12 }}
                >
                  ⏳ 待解鎖 ({vestDrafts.filter((v) => v.status === "pending").length})
                </button>
                <button
                  type="button"
                  className={statusFilter === "vested" ? "active" : ""}
                  onClick={() => setStatusFilter("vested")}
                  style={{ padding: "3px 8px", fontSize: 12 }}
                >
                  ✅ 已解鎖 ({vestDrafts.filter((v) => v.status === "vested").length})
                </button>
                <button
                  type="button"
                  className={statusFilter === "sold" ? "active" : ""}
                  onClick={() => setStatusFilter("sold")}
                  style={{ padding: "3px 8px", fontSize: 12 }}
                >
                  💰 已結清 ({vestDrafts.filter((v) => v.status === "sold").length})
                </button>
              </div>
            </div>

            {/* Batch actions when table has unsaved edits */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                基準股價：{currSign} {estPriceNum}
              </span>

              {hasDirty && (
                <>
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={handleSaveAllDirty}
                    disabled={batchUpdateMutation.isPending}
                    style={{ padding: "5px 12px", fontSize: 12, fontWeight: "bold", boxShadow: "0 0 10px rgba(59,130,246,0.3)" }}
                  >
                    {batchUpdateMutation.isPending ? "儲存中…" : `💾 儲存修改 (${dirtyRowIds.size} 筆)`}
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={handleResetDirty}
                    disabled={batchUpdateMutation.isPending}
                    style={{ padding: "5px 10px", fontSize: 12 }}
                  >
                    ↩️ 放棄修改
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Unsaved changes / success banner */}
          {hasDirty && (
            <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "8px 12px", borderRadius: 6, fontSize: 12, color: "var(--warning, #f59e0b)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>⚠️ 您已修改了 {dirtyRowIds.size} 期的解鎖日期或股數，總股數目前計算為 <strong>{draftTotalShares} 股</strong>（原 {g.totalQuantity} 股）。請點擊儲存以套用。</span>
              <button type="button" className="btn sm primary" onClick={handleSaveAllDirty} disabled={batchUpdateMutation.isPending}>
                💾 立即儲存
              </button>
            </div>
          )}

          {saveSuccessNotice && (
            <div style={{ background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "8px 12px", borderRadius: 6, fontSize: 12, color: "var(--income)" }}>
              {saveSuccessNotice}
            </div>
          )}

          {/* Interactive Editable Table */}
          <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 3 }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 70 }}>期數</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", width: 165 }}>解鎖日期 (可點擊修改)</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 145 }}>發放股數 (可直接改)</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 105 }}>稅後實得</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 120 }}>股價基準 / 實際</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", width: 125 }}>當期金額</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: 95 }}>狀態</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: 170 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredVests.map((v) => {
                  const pct = v.sellToCoverPct !== null && v.sellToCoverPct !== undefined ? v.sellToCoverPct : g.sellToCoverPct;
                  const netQty = Number(v.quantity) * (1 - Number(pct) / 100);
                  const isVested = v.status === "vested";
                  const isSold = v.status === "sold";
                  const isPending = v.status === "pending";

                  const sales = v.sells ?? [];
                  const totalSoldShares = sales.reduce((sum, s) => sum + Number(s.quantity), 0);
                  const remainingQty = netQty - totalSoldShares;

                  const actualReleasePrice = Number(v.vestPrice) || 0;
                  const actualReleaseVal = Number(v.quantity) * actualReleasePrice;
                  const estPeriodVal = Number(v.quantity) * estPriceNum;
                  const rowVal = isVested ? actualReleaseVal : estPeriodVal;

                  const isDirty = dirtyRowIds.has(v.id);

                  return (
                    <React.Fragment key={v.id}>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: isDirty ? "rgba(59, 130, 246, 0.08)" : undefined,
                          transition: "background 0.2s",
                        }}
                      >
                        {/* Period Index */}
                        <td style={{ padding: "8px 12px", fontWeight: "bold" }}>
                          第 {v.periodIndex} 期
                          {isDirty && <span style={{ marginLeft: 4, color: "var(--primary)" }}>●</span>}
                        </td>

                        {/* Vest Date Input */}
                        <td style={{ padding: "8px 12px" }}>
                          <DatePicker
                            value={v.vestDate}
                            onChange={(val) => updateDraft(v.id, { vestDate: val })}
                            isDirty={isDirty}
                          />
                        </td>

                        {/* Quantity Input */}
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={v.quantity}
                              onChange={(e) => updateDraft(v.id, { quantity: e.target.value })}
                              style={{
                                width: 68,
                                padding: "4px 8px",
                                textAlign: "right",
                                fontSize: 12,
                                fontWeight: 600,
                                borderRadius: 6,
                                border: isDirty
                                  ? "1px solid var(--accent, #398bf7)"
                                  : "1px solid rgba(255, 255, 255, 0.1)",
                                background: isDirty
                                  ? "rgba(59, 130, 246, 0.1)"
                                  : "rgba(255, 255, 255, 0.04)",
                                color: "var(--text, #e2e8f0)",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                outline: "none",
                                transition: "all 0.15s ease",
                              }}
                            />
                            <span className="muted" style={{ fontSize: 11 }}>股</span>
                          </div>
                        </td>

                        {/* Net Shares */}
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <span style={{ fontWeight: "bold" }}>{netQty.toFixed(2)}</span>
                          <div className="muted" style={{ fontSize: 10 }}>預扣 {pct}%</div>
                        </td>

                        {/* Share Price */}
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {isVested ? (
                            <span style={{ color: "var(--income)", fontWeight: "bold" }}>
                              {currSign} {actualReleasePrice}
                            </span>
                          ) : (
                            <span className="muted">{currSign} {estPriceNum}</span>
                          )}
                        </td>

                        {/* Total Value */}
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: "bold" }}>
                          <span style={{ color: isVested ? "var(--income)" : "var(--primary)" }}>
                            {currSign} {rowVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {isPending && <span className="badge" style={{ background: "rgba(74,144,226,0.15)", color: "var(--primary)", fontSize: 11 }}>⏳ 待解鎖</span>}
                          {isVested && <span className="badge" style={{ background: "rgba(81,207,102,0.15)", color: "var(--income)", fontSize: 11 }}>✅ 已解鎖</span>}
                          {isSold && <span className="badge muted-badge" style={{ background: "rgba(255,255,255,0.08)", fontSize: 11 }}>💰 已結清</span>}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                            {isDirty && (
                              <button
                                type="button"
                                className="btn primary sm"
                                onClick={() => handleSaveSingleRow(v.id)}
                                title="儲存此期修改"
                                style={{ padding: "2px 8px", fontSize: 11 }}
                              >
                                💾 存此列
                              </button>
                            )}

                            {editingVestId !== v.id && (
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => {
                                  setEditingVestId(v.id);
                                  setEditVestQty(v.quantity);
                                  setEditVestPrice(v.vestPrice || String(estPriceNum || ""));
                                  setEditVestCoverPct(v.sellToCoverPct || String(Number(g.sellToCoverPct)));
                                }}
                                style={{ padding: "2px 8px", fontSize: 11, border: "1px solid var(--border)" }}
                              >
                                ✍️ {isVested ? "調整所得" : "實際 Release"}
                              </button>
                            )}

                            {isVested && remainingQty > 0 && sellingVestId !== v.id && (
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => {
                                  setSellingVestId(v.id);
                                  setSoldPrice(g.currentPrice || v.vestPrice || "");
                                  setSellQty(remainingQty.toFixed(2));
                                  setReceivedAmount("");
                                }}
                                style={{ padding: "2px 8px", fontSize: 11, border: "1px solid var(--border)" }}
                              >
                                💰 賣出 ({remainingQty.toFixed(1)})
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Form: Input Actual Release Price */}
                      {editingVestId === v.id && (
                        <tr style={{ background: "var(--surface-2)" }}>
                          <td colSpan={8} style={{ padding: "12px 16px" }}>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                updateVestMutation.mutate({
                                  vestId: v.id,
                                  vestDate: v.vestDate,
                                  quantity: editVestQty || v.quantity,
                                  vestPrice: editVestPrice,
                                  sellToCoverPct: editVestCoverPct,
                                  status: "vested",
                                });
                              }}
                              style={{ display: "grid", gap: 10, background: "var(--surface)", padding: 14, borderRadius: 6, border: "1px solid var(--primary)" }}
                            >
                              <div style={{ fontWeight: "bold", fontSize: 13, color: "var(--primary)" }}>
                                📝 填寫第 {v.periodIndex} 期 ({v.vestDate}) 實際 Release 數據：
                              </div>
                              <div className="grid cols-3" style={{ gap: 10 }}>
                                <label style={{ fontSize: 11 }}>
                                  實際 Release 股價 ({g.priceCurrency})
                                  <AmountInput
                                    style={{ fontSize: 12, padding: "6px" }}
                                    required
                                    value={editVestPrice}
                                    onChange={setEditVestPrice}
                                    placeholder={`如 ${estPriceNum}`}
                                  />
                                </label>
                                <label style={{ fontSize: 11 }}>
                                  當期發放股數
                                  <AmountInput
                                    style={{ fontSize: 12, padding: "6px" }}
                                    required
                                    value={editVestQty}
                                    onChange={setEditVestQty}
                                  />
                                </label>
                                <label style={{ fontSize: 11 }}>
                                  賣股繳稅預扣 %
                                  <AmountInput
                                    style={{ fontSize: 12, padding: "6px" }}
                                    value={editVestCoverPct}
                                    onChange={setEditVestCoverPct}
                                  />
                                </label>
                              </div>

                              {Number(editVestQty) > 0 && Number(editVestPrice) > 0 && (
                                <div style={{ fontSize: 12, background: "rgba(16,185,129,0.1)", padding: "8px 12px", borderRadius: 4, color: "var(--income)", fontWeight: "bold" }}>
                                  💡 試算：解鎖總額/所得 = {editVestQty} 股 × {currSign}{editVestPrice} = {currSign}{(Number(editVestQty) * Number(editVestPrice)).toLocaleString()}
                                </div>
                              )}

                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button className="btn primary" style={{ padding: "4px 14px", fontSize: 12 }} type="submit" disabled={updateVestMutation.isPending}>
                                  {updateVestMutation.isPending ? "儲存中…" : "💾 確認寫入實際解鎖所得"}
                                </button>
                                <button type="button" className="btn ghost" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => setEditingVestId(null)}>
                                  取消
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}

                      {/* Expandable Form: Sell Stock */}
                      {sellingVestId === v.id && (
                        <tr style={{ background: "var(--surface-2)" }}>
                          <td colSpan={8} style={{ padding: "12px 16px" }}>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                sellMutation.mutate({
                                  vestId: v.id,
                                  soldPrice,
                                  soldDate,
                                  soldFee,
                                  quantity: sellQty,
                                  receivedAmount: receivedAmount || undefined,
                                  receivedAccountId: receivedAccountId || undefined,
                                });
                              }}
                              style={{ display: "grid", gap: 8, background: "var(--surface)", padding: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                            >
                              <div style={{ fontWeight: "bold", fontSize: 13 }}>
                                💰 賣出第 {v.periodIndex} 期解鎖股票 (賸餘 {remainingQty.toFixed(2)} 股)：
                              </div>
                              <div className="grid cols-3" style={{ gap: 8 }}>
                                <label style={{ fontSize: 11 }}>
                                  賣出股數
                                  <AmountInput
                                    style={{ fontSize: 11, padding: 4 }}
                                    required
                                    value={sellQty}
                                    onChange={setSellQty}
                                  />
                                </label>
                                <label style={{ fontSize: 11 }}>
                                  賣出每股價格 ({g.priceCurrency})
                                  <AmountInput
                                    style={{ fontSize: 11, padding: 4 }}
                                    required
                                    value={soldPrice}
                                    onChange={setSoldPrice}
                                  />
                                </label>
                                <label style={{ fontSize: 11 }}>
                                  賣出日期
                                  <div style={{ marginTop: 2 }}>
                                    <DatePicker
                                      value={soldDate}
                                      onChange={setSoldDate}
                                    />
                                  </div>
                                </label>
                              </div>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button className="btn primary" style={{ padding: "4px 12px", fontSize: 11 }} type="submit" disabled={sellMutation.isPending}>
                                  {sellMutation.isPending ? "送出中…" : "確認分批賣出"}
                                </button>
                                <button type="button" className="btn ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setSellingVestId(null)}>
                                  取消
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomRsuCalculator() {
  const [grantName, setGrantName] = useState("Google RSU 2026");
  const [stockSymbol, setStockSymbol] = useState("GOOGL");
  const [market, setMarket] = useState<"US" | "TW">("US");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [startDate, setStartDate] = useState(todayIso().slice(0, 7) + "-01");
  const [estimatedPrice, setEstimatedPrice] = useState("185");
  const [brokerAccountId, setBrokerAccountId] = useState("");
  const [sellToCoverPct, setSellToCoverPct] = useState("0");

  const [periodsCount, setPeriodsCount] = useState<number>(48);

  // Array of period items: { periodIndex, vestDate, quantity }
  const [periodVests, setPeriodVests] = useState<{ periodIndex: number; vestDate: string; quantity: string }[]>([]);

  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const accounts = trpc.accounts.list.useQuery();

  const invalidate = () =>
    Promise.all([utils.rsu.list.invalidate(), utils.forecast.projection.invalidate()]);

  const createMutation = trpc.rsu.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setSaveSuccessMsg(`🎉 成功建立「${grantName || stockSymbol}」RSU 授予計畫！`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    },
    onError: (e) => {
      setSaveSuccessMsg(`❌ 建立失敗：${e.message}`);
    },
  });

  // Re-generate schedule list when periodsCount, startDate, or frequency changes
  useEffect(() => {
    setPeriodVests((prev) => {
      const result = [];
      const defaultAvgQty = "50";
      for (let i = 0; i < periodsCount; i++) {
        const vDate = calculateVestDateIso(startDate, i, frequency);
        const existing = prev[i];
        result.push({
          periodIndex: i + 1,
          vestDate: vDate,
          quantity: existing ? existing.quantity : defaultAvgQty,
        });
      }
      return result;
    });
  }, [periodsCount, startDate, frequency]);

  useEffect(() => {
    const broker = accounts.data?.find((a) => a.type === "broker");
    if (!brokerAccountId && broker) setBrokerAccountId(broker.id);
  }, [accounts.data, brokerAccountId]);

  // Live total calculation
  const totalSharesSum = useMemo(() => {
    return periodVests.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
  }, [periodVests]);

  const currSign = market === "TW" ? "NT$" : "$";
  const estPriceNum = Number(estimatedPrice) || 0;
  const totalValuation = totalSharesSum * estPriceNum;

  const fixedDay = useMemo(() => {
    const parts = startDate.split("-");
    return parts[2] ? Number(parts[2]) : 1;
  }, [startDate]);

  const handleFetchStockPrice = async () => {
    if (!stockSymbol.trim()) return;
    setIsFetchingPrice(true);
    setFetchMsg(null);
    try {
      const res = await utils.rsu.fetchStockPrice.fetch({ symbol: stockSymbol.trim() });
      if (res.price != null) {
        setEstimatedPrice(String(res.price));
        setFetchMsg(`✅ 已自動抓取 ${res.symbol} 最新股價：$${res.price}`);
      } else {
        setFetchMsg(`⚠️ 找不到代號 ${stockSymbol} 的股價，請手動填寫。`);
      }
    } catch {
      setFetchMsg("⚠️ 抓取失敗，請手動填寫。");
    } finally {
      setIsFetchingPrice(false);
    }
  };

  // Quick Distribute Helper: Even Split
  const handleEvenSplit = () => {
    const promptShares = prompt(`請輸入要平均分配至 ${periodsCount} 期 的總股數：`, String(totalSharesSum || 2400));
    if (!promptShares) return;
    const total = Number(promptShares);
    if (!total || total <= 0) return;

    let remaining = total;
    const newVests = [...periodVests];
    for (let i = 0; i < periodsCount; i++) {
      const periodsLeft = periodsCount - i;
      const q = Math.ceil(remaining / periodsLeft);
      newVests[i] = {
        ...newVests[i]!,
        quantity: String(q),
      };
      remaining -= q;
    }
    setPeriodVests(newVests);
  };

  // Quick Distribute Helper: 4-Year Decreasing Split (38%, 32%, 20%, 10%)
  const handleYearlyRatioSplit = () => {
    const promptShares = prompt(`請輸入要按 4 年遞減比例 (38%, 32%, 20%, 10%) 分配的總股數：`, String(totalSharesSum || 2400));
    if (!promptShares) return;
    const total = Number(promptShares);
    if (!total || total <= 0) return;

    const yearlyShares = calculateCustomRsuVesting(total, [38, 32, 20, 10]);
    const monthsPerYear = frequency === "quarterly" ? 4 : 12;

    const newVests = [...periodVests];
    let vestIdx = 0;
    for (let y = 0; y < yearlyShares.length; y++) {
      let remainingYearShares = yearlyShares[y] ?? 0;
      for (let m = 0; m < monthsPerYear && vestIdx < periodsCount; m++) {
        const periodsLeftInYear = monthsPerYear - m;
        const q = Math.ceil(remainingYearShares / periodsLeftInYear);
        newVests[vestIdx] = {
          ...newVests[vestIdx]!,
          quantity: String(q),
        };
        remainingYearShares -= q;
        vestIdx++;
      }
    }
    setPeriodVests(newVests);
  };

  const handleSaveToDb = () => {
    createMutation.mutate({
      name: grantName || `${stockSymbol} RSU (${startDate})`,
      symbol: stockSymbol.trim().toUpperCase(),
      market,
      brokerAccountId: brokerAccountId || undefined,
      startDate,
      periods: periodVests.length,
      frequency,
      estimatedPrice: estimatedPrice || undefined,
      sellToCoverPct: Number(sellToCoverPct) || 0,
      customVests: periodVests.map((v) => ({
        periodIndex: v.periodIndex,
        vestDate: v.vestDate,
        quantity: v.quantity,
      })),
    });
  };

  return (
    <div className="card" style={{ marginBottom: 24, borderLeft: "4px solid var(--primary)", padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: "bold", display: "flex", alignItems: "center", gap: 8 }}>
          <span>📐 建立自訂 RSU 授予計畫 (支持每期股數自訂 & 發放頻率)</span>
        </h3>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          您可以設定按月/按季發放、自訂首次時間與固定扣款日，並直接手動填寫每一期的股數與預估股價。
        </p>
      </div>

      <div className="grid cols-3" style={{ gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>
          計畫名稱
          <input value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="如 2026 Google RSU" />
        </label>
        <label style={{ fontSize: 13 }}>
          股票市場 (美股 / 台股)
          <select value={market} onChange={(e) => {
            const m = e.target.value as "US" | "TW";
            setMarket(m);
            if (m === "TW" && stockSymbol === "GOOGL") setStockSymbol("2330");
          }}>
            <option value="US">美股 (US - USD)</option>
            <option value="TW">台股 (TW - TWD)</option>
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          股票代號 (Symbol)
          <div style={{ display: "flex", gap: 6 }}>
            <input value={stockSymbol} onChange={(e) => setStockSymbol(e.target.value)} placeholder="GOOGL" />
            <button type="button" className="btn ghost sm" onClick={handleFetchStockPrice} disabled={isFetchingPrice}>
              🔍 抓股價
            </button>
          </div>
        </label>
      </div>

      {fetchMsg && (
        <div style={{ fontSize: 12, marginBottom: 12, color: fetchMsg.startsWith("✅") ? "var(--income)" : "var(--expense)" }}>
          {fetchMsg}
        </div>
      )}

      <div className="grid cols-4" style={{ gap: 12, marginBottom: 14 }}>
        <label style={{ fontSize: 13 }}>
          發放頻率
          <select value={frequency} onChange={(e) => {
            const f = e.target.value as "monthly" | "quarterly";
            setFrequency(f);
            if (f === "quarterly" && periodsCount === 48) setPeriodsCount(16);
            if (f === "monthly" && periodsCount === 16) setPeriodsCount(48);
          }}>
            <option value="monthly">按月 (Monthly - 1個月)</option>
            <option value="quarterly">按季 (Quarterly - 3個月)</option>
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          首次發放時間 (第一期)
          <div style={{ marginTop: 4 }}>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
        </label>

        <label style={{ fontSize: 13 }}>
          預估領取時股價 ({currSign})
          <AmountInput value={estimatedPrice} onChange={setEstimatedPrice} placeholder="185.00" />
        </label>

        <label style={{ fontSize: 13 }}>
          總期數 ({frequency === "quarterly" ? "季" : "月"})
          <input
            inputMode="numeric"
            value={periodsCount}
            onChange={(e) => setPeriodsCount(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
          />
        </label>
      </div>

      <div className="grid cols-2" style={{ gap: 12, marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          入帳證券戶（選填）
          <select value={brokerAccountId} onChange={(e) => setBrokerAccountId(e.target.value)}>
            <option value="">不指定</option>
            {(accounts.data ?? []).filter((a) => a.type === "broker").map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13 }}>
          預設賣股繳稅比例 %
          <AmountInput value={sellToCoverPct} onChange={setSellToCoverPct} placeholder="0" />
        </label>
      </div>

      <div style={{ background: "rgba(74,144,226,0.08)", border: "1px solid rgba(74,144,226,0.2)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: "bold" }}>
          📌 扣款與發放規則：固定每期第 {fixedDay} 號發放（與首次時間對齊）。
        </div>
      </div>

      {/* Per-period Custom Shares Editing Section */}
      <div style={{ background: "var(--surface-2)", padding: 16, borderRadius: 8, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: "bold" }}>
              ✏️ 每一期股數填寫表 (共 {periodsCount} 期)
            </h4>
            <span className="muted" style={{ fontSize: 12 }}>
              您可以直接修改每一期的股數，右側將自動算出預估金額。
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn ghost sm" onClick={handleEvenSplit} style={{ fontSize: 12 }}>
              ⚡ 自動平均分配總股數
            </button>
            <button type="button" className="btn ghost sm" onClick={handleYearlyRatioSplit} style={{ fontSize: 12 }}>
              📈 按 4 年比例分配 (38%, 32%, 20%, 10%)
            </button>
          </div>
        </div>

        {/* Live Calculation Summary Banner */}
        <div style={{ display: "flex", gap: 16, background: "var(--surface)", padding: 12, borderRadius: 6, marginBottom: 12, border: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div>
            <span className="muted" style={{ fontSize: 12 }}>總期數：</span>
            <strong style={{ fontSize: 14 }}>{periodsCount} 期 ({frequency === "quarterly" ? "按季" : "按月"})</strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: 12 }}>總發放股數：</span>
            <strong style={{ fontSize: 14, color: "var(--income)" }}>{totalSharesSum.toLocaleString()} 股</strong>
          </div>
          <div>
            <span className="muted" style={{ fontSize: 12 }}>預估總所得/總價值：</span>
            <strong style={{ fontSize: 14, color: "var(--primary)" }}>
              {currSign} {totalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>
          </div>
        </div>

        {/* Scrollable Per-period Inputs */}
        <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>期數</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>預估發放日期 (固定 {fixedDay} 號)</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>當期股數 (可直接修改)</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>預估當期金額 ({currSign})</th>
              </tr>
            </thead>
            <tbody>
              {periodVests.map((v, idx) => {
                const qNum = Number(v.quantity) || 0;
                const pVal = qNum * estPriceNum;
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "6px 12px", fontWeight: "bold" }}>第 {v.periodIndex} 期</td>
                    <td style={{ padding: "6px 12px", color: "var(--muted)" }}>📅 {v.vestDate}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <input
                        style={{ width: 90, textAlign: "right", padding: "4px 8px", fontSize: 13, fontWeight: "bold" }}
                        value={v.quantity}
                        onChange={(e) => {
                          const newVests = [...periodVests];
                          newVests[idx] = {
                            ...newVests[idx]!,
                            quantity: e.target.value,
                          };
                          setPeriodVests(newVests);
                        }}
                      /> 股
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: "bold", color: "var(--primary)" }}>
                      {currSign} {pVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          className="btn primary"
          style={{ padding: "12px 24px", fontSize: 15, fontWeight: "bold" }}
          disabled={createMutation.isPending || !stockSymbol || totalSharesSum <= 0}
          onClick={handleSaveToDb}
        >
          {createMutation.isPending ? "建立中…" : "💾 確認建立 RSU 授予計畫"}
        </button>
        {saveSuccessMsg && (
          <span style={{ fontSize: 13, fontWeight: "bold", color: saveSuccessMsg.startsWith("🎉") ? "var(--income)" : "var(--expense)" }}>
            {saveSuccessMsg}
          </span>
        )}
      </div>
    </div>
  );
}
