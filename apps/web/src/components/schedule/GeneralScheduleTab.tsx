"use client";

import { Amount } from "@/components/Amount";
import { EditableRow } from "@/components/schedule/EditableRow";
import { FREQUENCY_LABELS, todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { niceConfirm } from "@/lib/confirm";
import { CategoryOptions } from "@/components/CategoryOptions";
import { AccountOptions } from "@/components/AccountOptions";
import { AmountInput } from "@/components/AmountInput";
import { getCategoryFullName } from "@/lib/categories";

const CYCLE_OPTIONS = [
  "monthly",
  "bimonthly_odd",
  "bimonthly_even",
  "quarterly",
  "half_yearly",
  "yearly",
] as const;

const CYCLE_LABELS: Record<string, string> = {
  monthly: "每月",
  bimonthly_odd: "雙月 (單數月)",
  bimonthly_even: "雙月 (雙數月)",
  quarterly: "每季",
  half_yearly: "每半年",
  yearly: "每年",
};

function getCycleLabel(frequency: string, interval: number, nextRunDate: string): string {
  if (frequency === "yearly") return "每年";
  if (frequency === "monthly") {
    if (interval === 6) return "每半年";
    if (interval === 3) return "每季";
    if (interval === 2) {
      const month = new Date(nextRunDate).getMonth();
      return month % 2 === 0 ? "雙月 (單數月)" : "雙月 (雙數月)";
    }
    return "每月";
  }
  return FREQUENCY_LABELS[frequency] || frequency;
}

type RuleKind = "income" | "expense" | "transfer";

type RuleRow = {
  id: string;
  name: string;
  kind: RuleKind;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  amountMinor: bigint;
  currency: string;
  frequency: string;
  interval: number;
  dayOfMonth: number | null;
  nextRunDate: string;
  anchorDate: string;
  active: boolean;
  autoCommit: boolean;
  sortOrder: number;
};

const KIND_LABELS: Record<RuleKind, string> = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
};

export function GeneralScheduleTab() {
  const utils = trpc.useUtils();
  const rules = trpc.recurring.list.useQuery();
  const accountList = trpc.accounts.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<RuleKind>("expense");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState<(typeof CYCLE_OPTIONS)[number]>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [yearlyMonth, setYearlyMonth] = useState(String(new Date().getMonth() + 1));
  const [yearlyDay, setYearlyDay] = useState(String(new Date().getDate()));
  const [anchorDate, setAnchorDate] = useState(() => todayIso());
  const [times, setTimes] = useState("");
  const [note, setNote] = useState("");
  const [autoCommit, setAutoCommit] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const invalidate = () =>
    Promise.all([
      utils.recurring.list.invalidate(),
      utils.transactions.monthlySummary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.recurring.create.useMutation({
    onSuccess: async () => {
      await invalidate();
      setName("");
      setAmount("");
      setCycle("monthly");
      setDayOfMonth("1");
      setYearlyMonth(String(new Date().getMonth() + 1));
      setYearlyDay(String(new Date().getDate()));
      setAnchorDate(todayIso());
      setTimes("");
      setNote("");
      setAutoCommit(true);
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.recurring.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.recurring.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.recurring.delete.useMutation({ onSuccess: invalidate });
  const updateSort = trpc.recurring.updateSort.useMutation({
    onMutate: async (newOrder) => {
      await utils.recurring.list.cancel();
      const prev = utils.recurring.list.getData();
      if (prev) {
        const sorted = [...prev].sort((a, b) => {
          const aOrder = newOrder.find((n) => n.id === a.id)?.sortOrder ?? a.sortOrder;
          const bOrder = newOrder.find((n) => n.id === b.id)?.sortOrder ?? b.sortOrder;
          return aOrder - bOrder;
        });
        utils.recurring.list.setData(undefined, sorted);
      }
      return { prev };
    },
    onError: (err, newOrder, context) => {
      if (context?.prev) utils.recurring.list.setData(undefined, context.prev);
    },
    onSettled: () => {
      invalidate();
    },
  });

  function handleMove(id: string, direction: "up" | "down") {
    const list = rules.data ?? [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === list.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newList = [...list];
    const temp = newList[idx]!;
    newList[idx] = newList[swapIdx]!;
    newList[swapIdx] = temp;

    const newOrder = newList.map((r, i) => ({ id: r.id, sortOrder: i }));
    updateSort.mutate(newOrder);
  }

  useEffect(() => {
    if (!accountId && accountList.data?.length) setAccountId(accountList.data[0]!.id);
  }, [accountList.data, accountId]);

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        訂閱、保險等非薪資的固定收支，或帳戶間的定期轉帳（例如每月轉存到儲蓄戶）。
      </p>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!accountId) return;
          let finalKind = kind;
          let finalTransferAccountId = transferAccountId;

          if (kind === "transfer" && transferAccountId === "other") {
            finalKind = "expense";
            finalTransferAccountId = "";
          }

          if (finalKind === "transfer" && (!finalTransferAccountId || finalTransferAccountId === accountId)) {
            setError("轉帳需選擇不同的轉入帳戶");
            return;
          }
          setError(null);
          let finalFrequency: "monthly" | "yearly" = "monthly";
          let finalInterval = 1;
          let finalAnchorDate = anchorDate;

          if (cycle === "yearly") {
            finalFrequency = "yearly";
            const today = new Date();
            const y = today.getFullYear();
            const m = parseInt(yearlyMonth) || 1;
            const d = parseInt(yearlyDay) || 1;
            let baseDate = new Date(y, m - 1, d);

            // 系統要求 anchorDate 必須包含年份。
            // 根據使用者的期望，如果輸入的日期今年還沒到，就從今年開始；如果已經過了，就從明年開始。
            if (baseDate < today) {
              baseDate.setFullYear(y + 1);
            }
            finalAnchorDate = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
          } else {
            if (cycle === "half_yearly") finalInterval = 6;
            else if (cycle === "quarterly") finalInterval = 3;
            else if (cycle === "bimonthly_odd" || cycle === "bimonthly_even") finalInterval = 2;

            const today = new Date();
            const d = parseInt(dayOfMonth) || 1;
            let baseDate = new Date(today.getFullYear(), today.getMonth(), d);

            if (cycle === "bimonthly_odd" && baseDate.getMonth() % 2 !== 0) {
              baseDate.setMonth(baseDate.getMonth() + 1);
            } else if (cycle === "bimonthly_even" && baseDate.getMonth() % 2 === 0) {
              baseDate.setMonth(baseDate.getMonth() + 1);
            }

            if (baseDate < today) {
              baseDate.setMonth(baseDate.getMonth() + finalInterval);
            }
            finalAnchorDate = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
          }

          create.mutate({
            name,
            kind: finalKind,
            accountId,
            transferAccountId: finalKind === "transfer" ? finalTransferAccountId : undefined,
            categoryId: finalKind === "transfer" ? undefined : categoryId || undefined,
            amount,
            frequency: finalFrequency,
            interval: finalInterval,
            dayOfMonth: cycle === "yearly" ? undefined : parseInt(dayOfMonth),
            anchorDate: finalAnchorDate,
            times: times ? parseInt(times) : undefined,
            note: note || undefined,
            autoCommit,
          });
        }}
      >
        <div className="seg">
          <button type="button" className={kind === "income" ? "active" : ""} onClick={() => setKind("income")}>
            收入
          </button>
          <button type="button" className={kind === "expense" ? "active" : ""} onClick={() => setKind("expense")}>
            支出
          </button>
          <button type="button" className={kind === "transfer" ? "active" : ""} onClick={() => setKind("transfer")}>
            轉帳
          </button>
        </div>
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {kind === "transfer" ? "從帳戶" : "帳戶"}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <AccountOptions accounts={accountList.data ?? []} />
            </select>
          </label>
          <label>
            金額
            <AmountInput required value={amount} onChange={setAmount} />
          </label>
        </div>
        <div className="grid cols-3">
          {kind === "transfer" ? (
            <label>
              轉入帳戶
              <select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)}>
                <AccountOptions accounts={(accountList.data ?? []).filter((a) => a.id !== accountId)} includeOther />
              </select>
            </label>
          ) : (
            <label>
              分類（選填）
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <CategoryOptions categories={categories.data ?? []} kind={kind} />
              </select>
            </label>
          )}
          <label>
            付款週期
            <select value={cycle} onChange={(e) => setCycle(e.target.value as typeof cycle)}>
              {CYCLE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CYCLE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {cycle !== "yearly" ? (
            <label>
              每月幾號
              <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          ) : (
            <label>
              每年幾月幾日
              <div className="row-inline">
                <input type="number" min="1" max="12" value={yearlyMonth} onChange={(e) => setYearlyMonth(e.target.value)} placeholder="月" style={{ width: 60 }} />
                <span>月</span>
                <input type="number" min="1" max="31" value={yearlyDay} onChange={(e) => setYearlyDay(e.target.value)} placeholder="日" style={{ width: 60 }} />
                <span>日</span>
              </div>
            </label>
          )}
          <label>
            次數（選填）
            <input type="number" min="1" placeholder="無限制" value={times} onChange={(e) => setTimes(e.target.value)} />
          </label>
        </div>
        <label className="checkbox-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, margin: "16px 0", justifyContent: "flex-start" }}>
          <input type="checkbox" checked={autoCommit} onChange={(e) => setAutoCommit(e.target.checked)} style={{ width: "auto", margin: 0 }} />
          <span>自動記帳（若取消勾選，到期時將在首頁提醒您手動輸入實際金額）</span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={create.isPending}>
          新增
        </button>
      </form>

      <div className="section-title">已設定</div>
      {!rules.data?.length ? (
        <div className="muted">尚無。</div>
      ) : (
        <div className="list">
          {(rules.data as RuleRow[]).map((r, i) => (
            <RuleItem
              key={r.id}
              r={r}
              accounts={accountList.data ?? []}
              categories={categories.data ?? []}
              editing={editingId === r.id}
              saving={update.isPending && editingId === r.id}
              canMoveUp={i > 0}
              canMoveDown={i < (rules.data?.length ?? 0) - 1}
              onMove={(dir) => handleMove(r.id, dir)}
              onEdit={() => setEditingId(r.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: r.id, ...patch })}
              onToggleActive={() => setActive.mutate({ id: r.id, active: !r.active })}
              onDelete={async () => {
                const ok = await niceConfirm("刪除定期計畫", `確定要刪除「${r.name}」計畫嗎？`, "danger");
                if (ok) remove.mutate({ id: r.id });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleItem({
  r,
  accounts,
  categories,
  editing,
  saving,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
}: {
  r: RuleRow & { baseCurrency?: string; amountBaseMinor?: bigint };
  accounts: { id: string; name: string; currency: string; type?: string }[];
  categories: { id: string; name: string; kind: string; parentId?: string | null }[];
  editing: boolean;
  saving: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: "up" | "down") => void;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: { name: string; amount: string; accountId: string; transferAccountId?: string; dayOfMonth?: number; categoryId?: string; autoCommit?: boolean; anchorDate?: string; nextRunDate?: string; }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(r.name);
  const [amount, setAmount] = useState(String(Number(r.amountMinor) / 100));
  const [accountId, setAccountId] = useState(r.accountId);
  const [transferAccountId, setTransferAccountId] = useState(r.transferAccountId ?? "");
  const [dayOfMonth, setDayOfMonth] = useState(String(r.dayOfMonth ?? 1));
  const [nextRunDate, setNextRunDate] = useState(r.nextRunDate ?? "");
  const [yearlyMonth, setYearlyMonth] = useState(() => {
    if (r.frequency === "yearly") return String(new Date(r.anchorDate).getMonth() + 1);
    return "1";
  });
  const [yearlyDay, setYearlyDay] = useState(() => {
    if (r.frequency === "yearly") return String(new Date(r.anchorDate).getDate());
    return "1";
  });
  const [categoryId, setCategoryId] = useState(r.categoryId ?? "");
  const [autoCommit, setAutoCommit] = useState(r.autoCommit);

  useEffect(() => {
    if (editing) {
      setName(r.name);
      setAmount(String(Number(r.amountMinor) / 100));
      setAccountId(r.accountId);
      setTransferAccountId(r.transferAccountId ?? "");
      setDayOfMonth(String(r.dayOfMonth ?? 1));
      setNextRunDate(r.nextRunDate ?? "");
      if (r.frequency === "yearly") {
        const d = new Date(r.anchorDate);
        setYearlyMonth(String(d.getMonth() + 1));
        setYearlyDay(String(d.getDate()));
      }
      setCategoryId(r.categoryId ?? "");
      setAutoCommit(r.autoCommit);
    }
  }, [editing, r]);

  const isTransfer = r.kind === "transfer";
  const srcAcct = accounts.find((a) => a.id === r.accountId)?.name ?? "未知帳戶";
  const destAcct = r.transferAccountId ? (accounts.find((a) => a.id === r.transferAccountId)?.name ?? "未知帳戶") : "其他";
  const fullCatName = getCategoryFullName(r.categoryId, categories);
  const catName = fullCatName !== "未分類" ? fullCatName : null;

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={r.active}
      onToggleActive={onToggleActive}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onMove={onMove}
      primary={
        <>
          {r.name}
          <span className="badge muted-badge">{KIND_LABELS[r.kind]}</span>
          {!r.active && <span className="badge muted-badge">已暫停</span>}
          {!r.autoCommit && <span className="badge primary-badge">手動確認</span>}
        </>
      }
      secondary={
        <>
          {r.kind === "transfer"
            ? `${srcAcct} → ${destAcct}`
            : catName
              ? `${srcAcct} · ${catName}`
              : srcAcct}
          <span className="badge">
            {r.frequency === "yearly" ? (
              `每年 ${new Date(r.anchorDate).getMonth() + 1} 月`
            ) : (
              `${getCycleLabel(r.frequency, r.interval, r.nextRunDate)}`
            )}
          </span>
          <span className="badge muted-badge">下次 {r.nextRunDate?.slice(0, 7)}</span>
        </>
      }
      right={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
          <Amount
            value={r.amountMinor}
            currency={r.currency}
            kind={r.kind === "income" ? "income" : r.kind === "expense" ? "expense" : "neutral"}
            signed={!isTransfer}
          />
          {r.amountBaseMinor !== undefined && r.baseCurrency && r.currency !== r.baseCurrency && (
            <span className="muted" style={{ fontSize: "11px" }}>
              ≈ <Amount value={r.amountBaseMinor} currency={r.baseCurrency} kind="neutral" variant="inline" />
            </span>
          )}
        </div>
      }
    >
      <form
        className="row-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          let finalAnchorDate: string | undefined;
          if (r.frequency === "yearly") {
            const today = new Date();
            const y = today.getFullYear();
            const m = parseInt(yearlyMonth) || 1;
            const d = parseInt(yearlyDay) || 1;
            let baseDate = new Date(y, m - 1, d);
            if (baseDate < today) {
              baseDate.setFullYear(y + 1);
            }
            finalAnchorDate = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, "0")}-${String(baseDate.getDate()).padStart(2, "0")}`;
          }

          onSave({
            name,
            amount,
            accountId,
            transferAccountId: isTransfer ? transferAccountId : undefined,
            dayOfMonth: parseInt(dayOfMonth) || 1,
            categoryId: isTransfer ? undefined : categoryId || undefined,
            autoCommit,
            anchorDate: finalAnchorDate,
            nextRunDate: nextRunDate || undefined,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {isTransfer ? "從帳戶" : "帳戶"}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <AccountOptions accounts={accounts} />
            </select>
          </label>
          <label>
            金額
            <AmountInput required value={amount} onChange={setAmount} />
          </label>
        </div>
        <div className="grid cols-3">
          {isTransfer ? (
            <label>
              轉入帳戶
              <select value={transferAccountId} onChange={(e) => setTransferAccountId(e.target.value)}>
                <AccountOptions accounts={accounts.filter(a => a.id !== accountId)} includeOther />
              </select>
            </label>
          ) : (
            <label>
              分類
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <CategoryOptions categories={categories} kind={r.kind} />
              </select>
            </label>
          )}
          {r.frequency === "monthly" && (
            <label>
              每月幾號
              <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          )}
          {r.frequency === "yearly" && (
            <label>
              每年幾月幾日
              <div className="row-inline">
                <input type="number" min="1" max="12" value={yearlyMonth} onChange={(e) => setYearlyMonth(e.target.value)} placeholder="月" style={{ width: 60 }} />
                <span>月</span>
                <input type="number" min="1" max="31" value={yearlyDay} onChange={(e) => setYearlyDay(e.target.value)} placeholder="日" style={{ width: 60 }} />
                <span>日</span>
              </div>
            </label>
          )}
          <label>
            {r.kind === "income" ? "下次入帳日" : isTransfer ? "下次轉帳日" : "下次扣款日"}
            <input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
          </label>
        </div>
        <label className="checkbox-label" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, margin: "16px 0", justifyContent: "flex-start" }}>
          <input type="checkbox" checked={autoCommit} onChange={(e) => setAutoCommit(e.target.checked)} style={{ width: "auto", margin: 0 }} />
          <span>自動記帳（若取消勾選，到期時將提醒手動輸入金額）</span>
        </label>
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
