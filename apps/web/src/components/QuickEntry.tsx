"use client";

import { fmt } from "@/lib/format";
import { todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";

type EntryType = "expense" | "income" | "transfer";

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

/**
 * Fast bookkeeping form used both on the dedicated page and inline on the
 * home screen. Optimised for repeated entry: after saving it keeps the type,
 * account and date, clears the amount, and refocuses so you can keep going.
 */
export function QuickEntry({ onDone }: { onDone?: () => void }) {
  const utils = trpc.useUtils();
  const accounts = trpc.accounts.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const [type, setType] = useState<EntryType>("expense");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const create = trpc.transactions.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.monthlySummary.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.netWorth.summary.invalidate(),
      ]);
      setFlash(`已新增 ${fmt(created?.amountMinor ?? 0n, created?.currency ?? "TWD")}`);
      setAmount("");
      setNote("");
      setCategoryId("");
      setError(null);
      amountRef.current?.focus();
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 2500);
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0]!.id);
  }, [accounts.data, accountId]);

  // Group categories into sections (parent → children) for easier scanning.
  const categoryGroups = useMemo(() => {
    if (type === "transfer")
      return [] as { label: string | null; items: { id: string; name: string }[] }[];
    const ofKind = (categories.data ?? []).filter((c) => c.kind === type);
    const parents = ofKind.filter((c) => !c.parentId);
    const childrenByParent = new Map<string, { id: string; name: string }[]>();
    for (const c of ofKind) {
      if (!c.parentId) continue;
      const list = childrenByParent.get(c.parentId);
      if (list) list.push(c);
      else childrenByParent.set(c.parentId, [c]);
    }
    const groups: { label: string | null; items: { id: string; name: string }[] }[] = [];
    const standalone: { id: string; name: string }[] = [];
    for (const p of parents) {
      const kids = childrenByParent.get(p.id) ?? [];
      if (kids.length) groups.push({ label: p.name, items: kids });
      else standalone.push(p);
    }
    if (standalone.length) groups.push({ label: "其他", items: standalone });
    return groups;
  }, [categories.data, type]);

  const destAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.id !== accountId),
    [accounts.data, accountId],
  );

  function addAmount(delta: number) {
    const current = Number(amount) || 0;
    const next = current + delta;
    setAmount(String(next));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !amount) return;
    if (type === "transfer" && !transferAccountId) {
      setError("請選擇轉入帳戶");
      return;
    }
    setError(null);
    create.mutate({
      type,
      accountId,
      transferAccountId: type === "transfer" ? transferAccountId : undefined,
      categoryId: type === "transfer" ? undefined : categoryId || undefined,
      amount,
      note: note || undefined,
      occurredAt: new Date(`${date}T12:00:00`),
    });
  }

  return (
    <form className="card quick-entry" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={type === "expense" ? "active" : ""} onClick={() => setType("expense")}>
          支出
        </button>
        <button type="button" className={type === "income" ? "active" : ""} onClick={() => setType("income")}>
          收入
        </button>
        <button type="button" className={type === "transfer" ? "active" : ""} onClick={() => setType("transfer")}>
          轉帳
        </button>
      </div>

      <div>
        <span className="field-label">{type === "transfer" ? "從帳戶" : "帳戶"}</span>
        <div className="chip-row">
          {(accounts.data ?? []).map((a) => (
            <button
              type="button"
              key={a.id}
              className={`chip${accountId === a.id ? " chip-on" : ""}`}
              onClick={() => setAccountId(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {type === "transfer" && (
        <div>
          <span className="field-label">轉入帳戶</span>
          <div className="chip-row">
            {destAccounts.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`chip${transferAccountId === a.id ? " chip-on" : ""}`}
                onClick={() => setTransferAccountId(a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <span className="field-label">分類</span>
          <div className="chip-row" style={{ marginBottom: categoryGroups.length ? 4 : 0 }}>
            <button
              type="button"
              className={`chip${categoryId === "" ? " chip-on" : ""}`}
              onClick={() => setCategoryId("")}
            >
              未分類
            </button>
          </div>
          {categoryGroups.map((g) => (
            <div className="cat-group" key={g.label}>
              <span className="cat-group-label">{g.label}</span>
              <div className="chip-row">
                {g.items.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`chip${categoryId === c.id ? " chip-on" : ""}`}
                    onClick={() => setCategoryId(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <span className="field-label">金額</span>
        <input
          ref={amountRef}
          className="amount-input"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
        <div className="chip-row" style={{ marginTop: 8 }}>
          {QUICK_AMOUNTS.map((v) => (
            <button type="button" key={v} className="chip" onClick={() => addAmount(v)}>
              +{v.toLocaleString()}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setAmount("")}>
            清除
          </button>
        </div>
      </div>

      <div className="grid cols-2">
        <label>
          日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          備註
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
        </label>
      </div>

      {error && <div className="error">{error}</div>}
      {flash && <div className="income" style={{ fontSize: 14 }}>{flash} ✓</div>}

      <div className="row-inline">
        <button
          className="btn"
          disabled={create.isPending || !accountId || !amount || (type === "transfer" && !transferAccountId)}
        >
          {create.isPending ? "儲存中…" : "儲存並繼續"}
        </button>
        {onDone && (
          <button type="button" className="btn ghost" onClick={onDone}>
            完成
          </button>
        )}
      </div>
    </form>
  );
}
