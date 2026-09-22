"use client";

import { AmountInput } from "@/components/AmountInput";
import { fmt } from "@/lib/format";
import { todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { TAIWAN_BANKS } from "@/lib/banks";
import { useEffect, useMemo, useRef, useState } from "react";

type EntryType = "expense" | "income" | "transfer";

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

function AccountGroupSelector({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: { id: string; name: string; currency: string; bankCode?: string | null }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof accounts>();
    for (const a of accounts) {
      // Use bank name if available, otherwise fallback to name
      const entityName = a.bankCode ? (TAIWAN_BANKS[a.bankCode] || a.name) : a.name;
      const list = map.get(entityName) ?? [];
      list.push(a);
      map.set(entityName, list);
    }
    return Array.from(map.entries()).map(([name, accts]) => ({ name, accounts: accts }));
  }, [accounts]);

  const selectedAccount = accounts.find(a => a.id === selectedId);
  const selectedEntityName = selectedAccount 
    ? (selectedAccount.bankCode ? (TAIWAN_BANKS[selectedAccount.bankCode] || selectedAccount.name) : selectedAccount.name)
    : (groups[0]?.name ?? "");

  const activeGroup = groups.find(g => g.name === selectedEntityName) || groups[0];

  return (
    <div>
      <div className="chip-row">
        {groups.map(g => {
          const isActive = g.name === activeGroup?.name;
          return (
            <button
              type="button"
              key={g.name}
              className={`chip${isActive ? " chip-on" : ""}`}
              onClick={() => {
                // When selecting a group, auto-select its first currency account
                if (!isActive && g.accounts.length > 0) {
                  onSelect(g.accounts[0]!.id);
                }
              }}
            >
              {g.name}
            </button>
          );
        })}
        {groups.length === 0 && (
          <span className="muted" style={{ fontSize: "12px", padding: "4px 8px" }}>
            無可用帳戶
          </span>
        )}
      </div>
      
      {activeGroup && activeGroup.accounts.length > 0 && (
        <div className="chip-row animate-fade-in" style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
          {activeGroup.accounts.map(a => (
            <button
              type="button"
              key={a.id}
              className={`chip${selectedId === a.id ? " chip-on" : ""}`}
              onClick={() => onSelect(a.id)}
              style={{ fontSize: "12px", padding: "4px 10px" }}
            >
              {a.currency}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [isForeign, setIsForeign] = useState(false);
  const [foreignCurrency, setForeignCurrency] = useState("USD");
  const [foreignAmount, setForeignAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("32.5");
  const [transferAmount, setTransferAmount] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const create = trpc.transactions.create.useMutation({
    onSuccess: async (created) => {
      if (attachmentFile && created?.id) {
        try {
          const formData = new FormData();
          formData.append("file", attachmentFile);
          formData.append("transactionId", created.id);
          await fetch("/api/attachments", {
            method: "POST",
            body: formData,
          });
        } catch (err) {
          console.warn("Attachment upload failed:", err);
        }
      }
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.monthlySummary.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.netWorth.summary.invalidate(),
        utils.attachments?.list.invalidate(),
      ]);
      setFlash(`已新增 ${fmt(created?.amountMinor ?? 0n, created?.currency ?? "TWD")}${attachmentFile ? "（含附件）" : ""}`);
      setAmount("");
      setForeignAmount("");
      setTransferAmount("");
      setIsForeign(false);
      setNote("");
      setCategoryId("");
      setSelectedParent(null);
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
      amountRef.current?.focus();
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 2500);
    },
    onError: (e) => setError(e.message),
  });

  const ratesQuery = trpc.accounts.activeFxRates.useQuery(undefined, { enabled: isForeign });

  useEffect(() => {
    if (ratesQuery.data && isForeign) {
      const rate = ratesQuery.data.rates.find((r) => r.currency === foreignCurrency)?.rate;
      if (rate) {
        setExchangeRate(String(rate));
      }
    }
  }, [foreignCurrency, ratesQuery.data, isForeign]);

  useEffect(() => {
    if (isForeign && foreignAmount && exchangeRate) {
      const converted = Number(foreignAmount) * Number(exchangeRate);
      if (!isNaN(converted)) {
        setAmount(String(Math.round(converted * 100) / 100));
      }
    }
  }, [isForeign, foreignAmount, exchangeRate]);

  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");

  const displayedAccounts = useMemo(() => {
    const list = accounts.data ?? [];
    if (type === "expense") {
      return list.filter((a) =>
        paymentType === "cash"
          ? a.type === "cash" || a.type === "wallet" || a.type === "bank"
          : a.type === "credit"
      );
    }
    if (type === "income") {
      return list.filter((a) => a.type === "cash" || a.type === "wallet" || a.type === "bank");
    }
    return list;
  }, [accounts.data, type, paymentType]);

  useEffect(() => {
    if (displayedAccounts.length > 0) {
      const exists = displayedAccounts.some((a) => a.id === accountId);
      if (!exists) {
        setAccountId(displayedAccounts[0]!.id);
      }
    } else {
      setAccountId("");
    }
  }, [displayedAccounts, accountId]);

  useEffect(() => {
    setCategoryId("");
    setSelectedParent(null);
  }, [type]);

  // Group categories into sections (parent → children) for easier scanning.
  const categoryGroups = useMemo(() => {
    if (type === "transfer")
      return [] as { label: string; items: { id: string; name: string }[]; isStandalone?: boolean; id?: string }[];
    const ofKind = (categories.data ?? []).filter((c) => c.kind === type);
    const parents = ofKind.filter((c) => !c.parentId);
    const childrenByParent = new Map<string, { id: string; name: string }[]>();
    for (const c of ofKind) {
      if (!c.parentId) continue;
      const list = childrenByParent.get(c.parentId);
      if (list) list.push(c);
      else childrenByParent.set(c.parentId, [c]);
    }
    const groups: { label: string; items: { id: string; name: string }[]; isStandalone?: boolean; id?: string }[] = [];
    for (const p of parents) {
      const l1 = childrenByParent.get(p.id) ?? [];
      const flatItems: { id: string; name: string }[] = [];
      for (const item1 of l1) {
        const l2 = childrenByParent.get(item1.id) ?? [];
        if (l2.length > 0) {
          flatItems.push({ id: item1.id, name: `📁 ${item1.name}` });
          for (const item2 of l2) {
            flatItems.push({ id: item2.id, name: `${item1.name} · ${item2.name}` });
          }
        } else {
          flatItems.push({ id: item1.id, name: item1.name });
        }
      }
      if (flatItems.length) groups.push({ label: p.name, items: flatItems });
      else groups.push({ label: p.name, items: [], isStandalone: true, id: p.id });
    }
    return groups;
  }, [categories.data, type]);

  const destAccounts = useMemo(() => {
    const list = (accounts.data ?? []).filter((a) => a.id !== accountId);
    list.push({ id: "other", name: "其他 (轉帳給他人)", currency: "轉出" } as any);
    return list;
  }, [accounts.data, accountId]);

  const [statementMonth, setStatementMonth] = useState("");

  const currentAccount = useMemo(() => {
    return accounts.data?.find((a) => a.id === accountId);
  }, [accounts.data, accountId]);

  const isCreditCard = currentAccount?.type === "credit";

  // Calculate default and optional statement cycle months for credit card
  const statementCycleOptions = useMemo(() => {
    if (!isCreditCard) return [];
    const bDay = currentAccount?.billingDay ?? 10;
    const dt = new Date(`${date}T12:00:00`);
    const year = dt.getFullYear();
    const month = dt.getMonth(); // 0-indexed
    const day = dt.getDate();

    // Auto default: if day <= bDay -> this month; if day > bDay -> next month
    const defaultDate = day <= bDay ? new Date(year, month, 1) : new Date(year, month + 1, 1);
    const prevDate = new Date(defaultDate.getFullYear(), defaultDate.getMonth() - 1, 1);
    const nextDate = new Date(defaultDate.getFullYear(), defaultDate.getMonth() + 1, 1);

    const fmtKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const fmtLabel = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月帳單 (${bDay}號結帳)`;

    return [
      { key: fmtKey(prevDate), label: fmtLabel(prevDate) },
      { key: fmtKey(defaultDate), label: `${fmtLabel(defaultDate)} (預設推薦)` },
      { key: fmtKey(nextDate), label: fmtLabel(nextDate) },
    ];
  }, [isCreditCard, currentAccount?.billingDay, date]);

  // Update default statementMonth when account or date changes
  useEffect(() => {
    if (isCreditCard && statementCycleOptions.length > 0) {
      // Keep existing selection if valid in options, else select recommended
      const found = statementCycleOptions.find((o) => o.key === statementMonth);
      if (!found) {
        setStatementMonth(statementCycleOptions[1]!.key);
      }
    } else {
      setStatementMonth("");
    }
  }, [isCreditCard, statementCycleOptions]);

  function addAmount(delta: number) {
    const current = Number(amount) || 0;
    const next = current + delta;
    setAmount(String(next));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !amount) return;
    let finalType = type;
    let finalTransferAccountId = transferAccountId;

    if (type === "transfer" && transferAccountId === "other") {
      finalType = "expense";
      finalTransferAccountId = "";
    }

    if (finalType === "transfer" && !finalTransferAccountId) {
      setError("請選擇轉入帳戶");
      return;
    }
    setError(null);
    const finalNote = isForeign
      ? `${note} (外幣消費: ${foreignCurrency} ${foreignAmount} @ ${exchangeRate})`.trim()
      : note;

    const srcAcct = accounts.data?.find((a) => a.id === accountId);
    const destAcct = accounts.data?.find((a) => a.id === transferAccountId);
    const hasCurrencySwap = type === "transfer" && srcAcct && destAcct && srcAcct.currency !== destAcct.currency;

    create.mutate({
      type: finalType,
      accountId,
      transferAccountId: finalType === "transfer" ? finalTransferAccountId : undefined,
      transferAmount: hasCurrencySwap ? transferAmount : undefined,
      categoryId: finalType === "transfer" ? undefined : categoryId || undefined,
      amount,
      note: finalNote || undefined,
      occurredAt: new Date(`${date}T12:00:00`),
      statementMonth: isCreditCard && statementMonth ? statementMonth : undefined,
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
        {type === "expense" && (
          <div className="seg" style={{ margin: "4px 0 10px", transform: "scale(0.9)", transformOrigin: "left" }}>
            <button
              type="button"
              className={paymentType === "cash" ? "active" : ""}
              onClick={() => setPaymentType("cash")}
              style={{ padding: "4px 12px", fontSize: "12px" }}
            >
              消費 (現金/銀行)
            </button>
            <button
              type="button"
              className={paymentType === "credit" ? "active" : ""}
              onClick={() => setPaymentType("credit")}
              style={{ padding: "4px 12px", fontSize: "12px" }}
            >
              刷卡 (信用卡)
            </button>
          </div>
        )}
        <AccountGroupSelector 
          accounts={displayedAccounts} 
          selectedId={accountId} 
          onSelect={setAccountId} 
        />
        {isCreditCard && statementCycleOptions.length > 0 && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span className="field-label" style={{ fontSize: 11, margin: 0, color: "var(--muted)" }}>
                💳 歸納帳單期數 (入帳月份)
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                每月 {currentAccount?.billingDay ?? 10} 號結帳
              </span>
            </div>
            <select
              value={statementMonth}
              onChange={(e) => setStatementMonth(e.target.value)}
              style={{ width: "100%", fontSize: 12, padding: "6px 8px", background: "rgba(0,0,0,0.2)", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
            >
              {statementCycleOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {type === "transfer" && (
        <div>
          <span className="field-label">轉入帳戶</span>
          <AccountGroupSelector 
            accounts={destAccounts} 
            selectedId={transferAccountId} 
            onSelect={setTransferAccountId} 
          />

          {(() => {
            const srcAcct = accounts.data?.find((a) => a.id === accountId);
            const destAcct = accounts.data?.find((a) => a.id === transferAccountId);
            if (srcAcct && destAcct && srcAcct.currency !== destAcct.currency) {
              return (
                <div style={{ marginTop: "12px", border: "1px dashed rgba(255,255,255,0.06)", padding: "10px", borderRadius: "6px" }}>
                  <label className="field-label" style={{ display: "block" }}>
                    入帳實收金額 ({destAcct.currency})
                    <AmountInput
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "4px",
                        color: "var(--text)",
                        fontSize: "18px",
                        padding: "6px 10px",
                        width: "100%",
                        marginTop: "6px",
                      }}
                      required
                      
                      value={transferAmount}
                      onChange={setTransferAmount}
                      placeholder={`預估實收 ${destAcct.currency}`}
                    />
                  </label>
                  {amount && transferAmount && (
                    <span className="muted" style={{ fontSize: "11px", display: "block", marginTop: "4px" }}>
                      實質匯率：1 {destAcct.currency} ≈ {(Number(amount) / (Number(transferAmount) || 1)).toFixed(4)} {srcAcct.currency}
                    </span>
                  )}
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {type !== "transfer" && (
        <div>
          <span className="field-label">分類</span>
          {/* 第一層：大分類 */}
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`chip${!selectedParent && !categoryId ? " chip-on" : ""}`}
              onClick={() => {
                setSelectedParent(null);
                setCategoryId("");
              }}
            >
              未分類
            </button>
            {categoryGroups.map((g) => (
              <button
                type="button"
                key={g.label}
                className={`chip${selectedParent === g.label || (g.isStandalone && categoryId === g.id) ? " chip-on" : ""}`}
                onClick={() => {
                  if (g.isStandalone && g.id) {
                    setCategoryId(g.id);
                    setSelectedParent(null);
                  } else {
                    setSelectedParent(g.label);
                  }
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* 第二層：子分類 */}
          {selectedParent && (
            <div className="cat-group animate-fade-in">
              <span className="cat-group-label">{selectedParent} 的子選項</span>
              <div className="chip-row">
                {categoryGroups
                  .find((g) => g.label === selectedParent)
                  ?.items.map((c) => (
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
          )}
        </div>
      )}

      <div>
        <span className="field-label">金額</span>
        <AmountInput
          ref={amountRef}
          className="amount-input"
          required
          
          value={amount}
          onChange={setAmount}
          placeholder="0"
          disabled={isForeign}
        />
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: 8 }}>
          <label style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
            <input type="checkbox" checked={isForeign} onChange={(e) => setIsForeign(e.target.checked)} />
            外幣消費 (自動折算)
          </label>
        </div>

        {isForeign && (
          <div className="grid cols-3" style={{ marginTop: 8, background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 6 }}>
            <label style={{ fontSize: 11 }}>
              外幣幣別
              <select style={{ fontSize: 12, padding: "4px 8px" }} value={foreignCurrency} onChange={(e) => setForeignCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
                <option value="HKD">HKD</option>
              </select>
            </label>
            <label style={{ fontSize: 11 }}>
              外幣金額
              <AmountInput style={{ fontSize: 12, padding: "4px 8px" }}  required={isForeign} value={foreignAmount} onChange={setForeignAmount} placeholder="100.00" />
            </label>
            <label style={{ fontSize: 11 }}>
              匯率
              <AmountInput style={{ fontSize: 12, padding: "4px 8px" }}  required={isForeign} value={exchangeRate} onChange={setExchangeRate} placeholder="32.5" />
            </label>
          </div>
        )}
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

      <div style={{ marginTop: 2, marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
          <span>📎 附加單據 / PDF (選填)：</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            style={{ fontSize: 12, color: "var(--fg)" }}
            onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
          />
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
