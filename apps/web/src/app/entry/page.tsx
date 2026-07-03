"use client";

import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { fmt } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type EntryType = "expense" | "income" | "transfer";

export default function EntryPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const accounts = trpc.accounts.list.useQuery(undefined, { enabled: !!session?.user });
  const categories = trpc.categories.list.useQuery(undefined, { enabled: !!session?.user });

  const [type, setType] = useState<EntryType>("expense");
  const [accountId, setAccountId] = useState("");
  const [transferAccountId, setTransferAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.transactions.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.transactions.list.invalidate(),
        utils.transactions.monthlySummary.invalidate(),
        utils.accounts.listWithBalances.invalidate(),
        utils.netWorth.summary.invalidate(),
      ]);
      setAmount("");
      setNote("");
      setCategoryId("");
      setError(null);
      router.push("/");
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (!accountId && accounts.data?.length) setAccountId(accounts.data[0]!.id);
  }, [accounts.data, accountId]);

  const filteredCategories = useMemo(() => {
    if (type === "transfer") return [];
    return (categories.data ?? []).filter((c) => c.kind === type);
  }, [categories.data, type]);

  const destAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => a.id !== accountId),
    [accounts.data, accountId],
  );

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>記一筆</h2>

        <form
          className="card"
          style={{ maxWidth: 520 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!accountId || !amount) return;
            setError(null);
            create.mutate({
              type,
              accountId,
              transferAccountId: type === "transfer" ? transferAccountId : undefined,
              categoryId: type === "transfer" ? undefined : categoryId || undefined,
              amount,
              note: note || undefined,
            });
          }}
        >
          <div className="seg">
            <button
              type="button"
              className={type === "expense" ? "active" : ""}
              onClick={() => setType("expense")}
            >
              支出
            </button>
            <button
              type="button"
              className={type === "income" ? "active" : ""}
              onClick={() => setType("income")}
            >
              收入
            </button>
            <button
              type="button"
              className={type === "transfer" ? "active" : ""}
              onClick={() => setType("transfer")}
            >
              轉帳
            </button>
          </div>

          <label>
            {type === "transfer" ? "從帳戶" : "帳戶"}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（{a.currency}）
                </option>
              ))}
            </select>
          </label>

          {type === "transfer" && (
            <label>
              轉入帳戶
              <select
                value={transferAccountId}
                onChange={(e) => setTransferAccountId(e.target.value)}
                required
              >
                <option value="">請選擇</option>
                {destAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}（{a.currency}）
                  </option>
                ))}
              </select>
            </label>
          )}

          {type !== "transfer" && (
            <label>
              分類
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">未分類</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentId ? "— " : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            金額
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            備註
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
          </label>

          {error && <div className="error">{error}</div>}

          <button
            className="btn"
            disabled={
              create.isPending ||
              !accountId ||
              !amount ||
              (type === "transfer" && !transferAccountId)
            }
          >
            {create.isPending ? "儲存中…" : "儲存"}
          </button>
        </form>
      </div>
    </>
  );
}
