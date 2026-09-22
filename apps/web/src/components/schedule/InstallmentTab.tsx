"use client";

import { Amount } from "@/components/Amount";
import { isInstallmentFinished, isInstallmentPaused } from "@/lib/installment-status";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { niceConfirm } from "@/lib/confirm";
import { AccountOptions } from "../AccountOptions";
import { AmountInput } from "../AmountInput";
import { CategoryOptions } from "../CategoryOptions";
import { getCategoryFullName } from "@/lib/categories";

type InstallmentRow = {
  id: string;
  name: string;
  accountId: string;
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  nextRunDate: string;
  totalPeriods: number | null;
  completedPeriods: number;
  active: boolean;
  categoryId?: string | null;
};

type EditDraft = {
  name: string;
  accountId: string;
  amount: string;
  dayOfMonth: string;
  totalPeriods: string;
  firstMonth: string;
  categoryId: string;
};

type AccountOption = {
  id: string;
  name: string;
  currency: string;
  type?: string;
  cardNumber?: string | null;
  cardExpiry?: string | null;
  billingDay?: number | null;
  repaymentDay?: number | null;
};


function draftFromRow(s: InstallmentRow): EditDraft {
  return {
    name: s.name,
    accountId: s.accountId,
    amount: String(Number(s.amountMinor) / 100),
    dayOfMonth: String(s.dayOfMonth),
    totalPeriods: s.totalPeriods != null ? String(s.totalPeriods) : "",
    firstMonth: s.nextRunDate.slice(0, 7),
    categoryId: s.categoryId ?? "",
  };
}

function InstallmentListItem({
  s,
  accounts,
  categories,
  editing,
  editError,
  saving,
  onStartEdit,
  onCancelEdit,
  onSave,
  onToggleActive,
  onDelete,
}: {
  s: InstallmentRow;
  accounts: AccountOption[];
  categories: any[];
  editing: boolean;
  editError: string | null;
  saving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: EditDraft) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const finished = isInstallmentFinished(s);
  const paused = isInstallmentPaused(s);
  const [draft, setDraft] = useState<EditDraft>(() => draftFromRow(s));

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === draft.accountId);
  }, [accounts, draft.accountId]);

  useEffect(() => {
    if (editing) setDraft(draftFromRow(s));
  }, [editing, s]);

  return (
    <div className={`list-item${finished ? " finished" : ""}${editing ? " editing" : ""}`}>
      <div className="row">
        <div className="meta">
          <span className="primary">
            {s.name}
            {finished && <span className="badge muted-badge">已結清</span>}
            {paused && <span className="badge muted-badge">已暫停</span>}
          </span>
          <span className="secondary">
            {getCategoryFullName(s.categoryId, categories) !== "未分類" ? `${getCategoryFullName(s.categoryId, categories)} · ` : ""}
            每月
            {!finished && ` · 下次 ${s.nextRunDate?.slice(0, 7)}`}
            {s.totalPeriods != null ? ` · 已繳 ${s.completedPeriods}/${s.totalPeriods} 期` : ""}
          </span>
        </div>
        <div className="row-inline">
          {!editing && (
            <Amount
              value={s.amountMinor}
              currency={s.currency}
              kind={finished ? "neutral" : "expense"}
              signed={!finished}
            />
          )}
          {!finished && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => (editing ? onCancelEdit() : onStartEdit())}
            >
              {editing ? "收合" : "編輯"}
            </button>
          )}
          {!finished && !editing && (
            <button type="button" className="btn ghost" onClick={onToggleActive}>
              {s.active ? "暫停" : "啟用"}
            </button>
          )}
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
              onSave(draft);
            }}
          >
            <div className="grid cols-3">
              <label>
                名稱
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label>
                扣款帳戶
                <select
                  value={draft.accountId}
                  onChange={(e) => setDraft((d) => ({ ...d, accountId: e.target.value }))}
                >
                  <AccountOptions accounts={accounts} />
                </select>
                {accounts.length === 0 && (
                  <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--expense)" }}>
                    ⚠️ 尚無設定完整卡片資訊之信用卡，請先至「帳戶」設定！
                  </div>
                )}
              </label>
              <label>
                每月金額
                <AmountInput
                  required
                  value={draft.amount}
                  onChange={(val) => setDraft((d) => ({ ...d, amount: val }))}
                />
              </label>
            </div>
            <div className="grid cols-3">
              <label>
                分類
                <select
                  value={draft.categoryId}
                  onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}
                >
                  <CategoryOptions categories={categories} kind="expense" />
                </select>
              </label>
              <label>
                每月扣款日
                <input
                  inputMode="numeric"
                  min={1}
                  max={31}
                  disabled={!!selectedAccount}
                  value={selectedAccount ? String(selectedAccount.billingDay ?? 10) : draft.dayOfMonth}
                  onChange={(e) => setDraft((d) => ({ ...d, dayOfMonth: e.target.value }))}
                />
                {selectedAccount && (
                  <span className="secondary" style={{ fontSize: 11, marginTop: 4 }}>
                    已自動帶入信用卡的結帳日（每月 {selectedAccount.billingDay ?? 10} 日）
                  </span>
                )}
              </label>
              <label>
                第一次繳款月份
                <input
                  type="month"
                  required
                  value={draft.firstMonth}
                  onChange={(e) => setDraft((d) => ({ ...d, firstMonth: e.target.value }))}
                />
              </label>
              <label>
                總期數
                <input
                  required
                  inputMode="numeric"
                  min={s.completedPeriods || 1}
                  max={120}
                  value={draft.totalPeriods}
                  onChange={(e) => setDraft((d) => ({ ...d, totalPeriods: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ marginTop: "-8px", marginBottom: "8px" }}>
              <span className="secondary" style={{ fontSize: 12 }}>
                已扣 {s.completedPeriods} 期，總期數不可小於此
              </span>
            </div>
            {editError && <div className="error">{editError}</div>}
            <div className="row-inline">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "儲存中…" : "儲存"}
              </button>
              <button type="button" className="btn ghost" onClick={onCancelEdit}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function InstallmentTab() {
  const utils = trpc.useUtils();
  const list = trpc.installments.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [firstMonth, setFirstMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [totalPeriods, setTotalPeriods] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const creditCardOptions = useMemo(() => {
    return ((accounts.data ?? []) as AccountOption[]).filter(
      (a) => a.type === "credit"
    );
  }, [accounts.data]);

  const selectedAccount = useMemo(() => {
    return creditCardOptions.find((a) => a.id === accountId);
  }, [creditCardOptions, accountId]);

  const create = trpc.installments.create.useMutation({
    onSuccess: async () => {
      await utils.installments.list.invalidate();
      await utils.forecast.projection.invalidate();
      setName("");
      setAmount("");
      setCategoryId("");
      setDayOfMonth("1");
      setFirstMonth(new Date().toISOString().slice(0, 7));
      setTotalPeriods("");
      setCreateError(null);
    },
    onError: (e) => setCreateError(e.message),
  });

  const update = trpc.installments.update.useMutation({
    onSuccess: async () => {
      await utils.installments.list.invalidate();
      await utils.forecast.projection.invalidate();
      setEditingId(null);
      setEditError(null);
    },
    onError: (e) => setEditError(e.message),
  });

  const setActive = trpc.installments.setActive.useMutation({
    onSuccess: () => {
      utils.installments.list.invalidate();
      utils.forecast.projection.invalidate();
    },
  });
  const remove = trpc.installments.delete.useMutation({
    onSuccess: () => {
      utils.installments.list.invalidate();
      utils.forecast.projection.invalidate();
      if (editingId) setEditingId(null);
    },
  });

  const { activeList, finishedList, totals } = useMemo(() => {
    const rows = (list.data ?? []) as InstallmentRow[];
    const active = rows.filter((s) => !isInstallmentFinished(s));
    const finished = rows.filter((s) => isInstallmentFinished(s));

    const totalsMap = new Map<string, { monthly: bigint; remaining: bigint }>();
    for (const s of active) {
      if (!totalsMap.has(s.currency)) {
        totalsMap.set(s.currency, { monthly: 0n, remaining: 0n });
      }
      const t = totalsMap.get(s.currency)!;
      if (s.active) {
        t.monthly += s.amountMinor;
      }
      const total = s.totalPeriods ?? 0;
      const completed = s.completedPeriods ?? 0;
      if (total > completed) {
        t.remaining += BigInt(total - completed) * s.amountMinor;
      }
    }

    return {
      activeList: active,
      finishedList: finished,
      totals: Array.from(totalsMap.entries()).map(([currency, val]) => ({
        currency,
        ...val,
      })),
    };
  }, [list.data]);

  const groupedActiveList = useMemo(() => {
    const groups = new Map<string, { accountName: string; currency: string; type: string; totalMonthlyMinor: bigint; totalRemainingMinor: bigint; items: InstallmentRow[] }>();
    for (const s of activeList) {
      const acct = (accounts.data ?? []).find(a => a.id === s.accountId);
      const acctName = acct?.name ?? "未知帳戶";
      const key = s.accountId;
      if (!groups.has(key)) {
        groups.set(key, {
          accountName: acctName,
          currency: s.currency,
          type: acct?.type === "credit" ? "信用卡" : "帳戶",
          totalMonthlyMinor: 0n,
          totalRemainingMinor: 0n,
          items: [],
        });
      }
      const g = groups.get(key)!;
      g.items.push(s);
      if (s.active) {
        g.totalMonthlyMinor += s.amountMinor;
      }
      const total = s.totalPeriods ?? 0;
      const completed = s.completedPeriods ?? 0;
      if (total > completed) {
        g.totalRemainingMinor += BigInt(total - completed) * s.amountMinor;
      }
    }
    return Array.from(groups.entries()).map(([accountId, data]) => ({
      accountId,
      ...data,
    }));
  }, [activeList, accounts.data]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (!accountId && creditCardOptions.length) setAccountId(creditCardOptions[0]!.id);
  }, [creditCardOptions, accountId]);

  function saveEdit(id: string, draft: EditDraft) {
    if (!draft.accountId || !draft.totalPeriods) return;
    setEditError(null);
    const selected = creditCardOptions.find((a) => a.id === draft.accountId);
    update.mutate({
      id,
      name: draft.name,
      accountId: draft.accountId,
      amount: draft.amount,
      dayOfMonth: selected ? (selected.billingDay ?? 10) : Number(draft.dayOfMonth),
      totalPeriods: Number(draft.totalPeriods),
      firstMonth: draft.firstMonth,
      categoryId: draft.categoryId || null,
    });
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        信用卡分期、消費貸款等：指定扣款帳戶、每月金額與總期數，到期自動記支出並標為已結清。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId || !totalPeriods) return;
          setCreateError(null);
          create.mutate({
            name,
            accountId,
            amount,
            dayOfMonth: selectedAccount ? (selectedAccount.billingDay ?? 10) : Number(dayOfMonth),
            totalPeriods: Number(totalPeriods),
            firstMonth,
            categoryId: categoryId || undefined,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone 分期" />
          </label>
          <label>
            扣款帳戶
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">請選擇</option>
              <AccountOptions accounts={creditCardOptions} />
            </select>
            {creditCardOptions.length === 0 && (
              <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--expense)" }}>
                ⚠️ 尚無設定完整卡號、驗證碼與效期之信用卡，請先至「帳戶」設定！
              </div>
            )}
          </label>
          <label>
            每月金額
            <AmountInput required value={amount} onChange={setAmount} />
          </label>
        </div>
        <div className="grid cols-3">
          <label>
            分類
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <CategoryOptions categories={categories.data ?? []} kind="expense" />
            </select>
          </label>
          <label>
            每月扣款日
            <input
              inputMode="numeric"
              min={1}
              max={31}
              disabled={!!selectedAccount}
              value={selectedAccount ? String(selectedAccount.billingDay ?? 10) : dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
            {selectedAccount && (
              <span className="secondary" style={{ fontSize: 11, marginTop: 4 }}>
                已自動帶入信用卡的結帳日（每月 {selectedAccount.billingDay ?? 10} 日）
              </span>
            )}
          </label>
          <label>
            第一次繳款月份
            <input
              type="month"
              required
              value={firstMonth}
              onChange={(e) => setFirstMonth(e.target.value)}
            />
          </label>
          <label>
            總期數
            <input
              required
              inputMode="numeric"
              min={1}
              max={120}
              value={totalPeriods}
              onChange={(e) => setTotalPeriods(e.target.value)}
              placeholder="12"
            />
          </label>
        </div>
        {createError && <div className="error">{createError}</div>}
        <button className="btn" disabled={create.isPending}>
          {create.isPending ? "新增中…" : "新增分期"}
        </button>
      </form>

      <div className="section-title">進行中</div>
      {!list.isLoading && activeList.length > 0 && totals.length > 0 && (
        <div className="card" style={{ marginBottom: "16px", padding: "16px", background: "rgba(255,255,255,0.02)" }}>
          <div className="grid cols-2" style={{ gap: "24px" }}>
            <div>
              <span className="muted" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>每月應付分期總計</span>
              {totals.map((t) => (
                <div key={t.currency} style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <Amount value={t.monthly} currency={t.currency} kind="expense" variant="stat" />
                </div>
              ))}
            </div>
            <div>
              <span className="muted" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>未結清分期總額</span>
              {totals.map((t) => (
                <div key={t.currency} style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <Amount value={t.remaining} currency={t.currency} kind="neutral" variant="stat" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {list.isLoading ? (
        <div className="muted">載入中…</div>
      ) : !activeList.length ? (
        <div className="muted">尚無進行中的分期。</div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {groupedActiveList.map((g) => {
            const isExpanded = !!expandedGroups[g.accountId];
            return (
              <div key={g.accountId} className="card" style={{ padding: 0 }}>
                {/* Group Header */}
                <div 
                  className="row-inline" 
                  style={{ 
                    padding: "16px", 
                    cursor: "pointer", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    borderBottom: isExpanded ? "1px solid rgba(255,255,255,0.05)" : "none"
                  }}
                  onClick={() => toggleGroup(g.accountId)}
                >
                  <div className="row-inline" style={{ gap: "12px", alignItems: "center" }}>
                    <span style={{ 
                      fontSize: "12px", 
                      color: "var(--muted)", 
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s ease",
                      display: "inline-block"
                    }}>
                      ▶
                    </span>
                    {g.type && (
                      <span className="badge" style={{ background: g.type === "信用卡" ? "rgba(255,107,107,0.1)" : "rgba(81,207,102,0.1)", color: g.type === "信用卡" ? "var(--expense)" : "var(--income)", border: "none" }}>
                        {g.type}
                      </span>
                    )}
                    <span style={{ fontWeight: 600, fontSize: "15px" }}>{g.accountName}</span>
                    <span className="secondary" style={{ fontSize: "12px" }}>
                      (共 {g.items.length} 筆)
                    </span>
                  </div>
                  
                  <div className="row-inline" style={{ gap: "16px", alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <span className="muted" style={{ fontSize: "11px", display: "block" }}>每月分期應付</span>
                      <Amount value={g.totalMonthlyMinor} currency={g.currency} kind="expense" />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className="muted" style={{ fontSize: "11px", display: "block" }}>未結清總額</span>
                      <Amount value={g.totalRemainingMinor} currency={g.currency} kind="neutral" />
                    </div>
                  </div>
                </div>
                
                {/* Group Items */}
                {isExpanded && (
                  <div className="list" style={{ padding: "0 16px 16px 16px", marginTop: "12px" }}>
                    {g.items.map((s) => (
                      <InstallmentListItem
                        key={s.id}
                        s={s}
                        accounts={creditCardOptions}
                        categories={categories.data ?? []}
                        editing={editingId === s.id}
                        editError={editingId === s.id ? editError : null}
                        saving={update.isPending && editingId === s.id}
                        onStartEdit={() => {
                          setEditError(null);
                          setEditingId(s.id);
                        }}
                        onCancelEdit={() => {
                          setEditError(null);
                          setEditingId(null);
                        }}
                        onSave={(draft) => saveEdit(s.id, draft)}
                        onToggleActive={() => setActive.mutate({ id: s.id, active: !s.active })}
                        onDelete={async () => {
                          const ok = await niceConfirm("刪除信用卡分期", `確定要刪除「${s.name}」分期計畫嗎？`, "danger");
                          if (ok) remove.mutate({ id: s.id });
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {finishedList.length > 0 && (
        <>
          <div className="section-title">已結清</div>
          <div className="list">
            {finishedList.map((s) => (
              <InstallmentListItem
                key={s.id}
                s={s}
                accounts={creditCardOptions}
                categories={categories.data ?? []}
                editing={false}
                editError={null}
                saving={false}
                onStartEdit={() => {}}
                onCancelEdit={() => {}}
                onSave={() => {}}
                onToggleActive={() => {}}
                onDelete={async () => {
                  const ok = await niceConfirm("刪除信用卡分期", `確定要刪除「${s.name}」分期計畫嗎？`, "danger");
                  if (ok) remove.mutate({ id: s.id });
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
