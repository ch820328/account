"use client";

import { TopBar } from "@/components/TopBar";
import { TransactionList } from "@/components/TransactionList";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { todayIso } from "@/lib/labels";
import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

const PAGE = 50;

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <>
          <TopBar />
          <div className="container muted">載入中…</div>
        </>
      }
    >
      <TransactionsInner />
    </Suspense>
  );
}

function TransactionsInner() {
  const { ready } = useAuthGuard();
  const params = useSearchParams();

  const [type, setType] = useState<"" | "income" | "expense" | "transfer">(
    (params.get("type") as "" | "income" | "expense" | "transfer") || "",
  );
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [categoryId, setCategoryId] = useState(params.get("category") ?? "");
  const [month, setMonth] = useState(params.get("month") ?? "");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const accounts = trpc.accounts.list.useQuery(undefined, { enabled: ready });
  const categories = trpc.categories.list.useQuery(undefined, { enabled: ready });

  const filters = useMemo(
    () => ({
      limit: PAGE,
      offset,
      type: type || undefined,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      month: month || undefined,
      search: search.trim() || undefined,
    }),
    [type, accountId, categoryId, month, search, offset],
  );

  const list = trpc.transactions.list.useQuery(filters, { enabled: ready });
  const utils = trpc.useUtils();

  function resetOffset() {
    setOffset(0);
  }

  if (!ready) {
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
        <h2 style={{ marginTop: 0 }}>交易紀錄</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          查詢與篩選所有交易，可依類型、帳戶、分類、月份或備註搜尋。
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid cols-3">
            <label>
              類型
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                  resetOffset();
                }}
              >
                <option value="">全部</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="transfer">轉帳</option>
              </select>
            </label>
            <label>
              帳戶
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  resetOffset();
                }}
              >
                <option value="">全部</option>
                {(accounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              分類
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  resetOffset();
                }}
              >
                <option value="">全部</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid cols-2">
            <label>
              月份
              <input
                type="month"
                value={month}
                max={todayIso().slice(0, 7)}
                onChange={(e) => {
                  setMonth(e.target.value);
                  resetOffset();
                }}
              />
            </label>
            <label>
              備註搜尋
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetOffset();
                }}
                placeholder="關鍵字"
              />
            </label>
          </div>
        </div>

        <TransactionList
          data={list.data?.items}
          loading={list.isLoading}
          invalidate={() =>
            Promise.all([
              utils.transactions.list.invalidate(),
              utils.transactions.monthlyBreakdown.invalidate(),
              utils.accounts.listWithBalances.invalidate(),
              utils.netWorth.summary.invalidate(),
            ])
          }
        />

        <div className="row-inline" style={{ justifyContent: "center", marginTop: 16, gap: 12 }}>
          <button
            className="btn ghost"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          >
            上一頁
          </button>
          <span className="muted" style={{ fontSize: 13 }}>第 {offset / PAGE + 1} 頁</span>
          <button
            className="btn ghost"
            disabled={!list.data?.hasMore}
            onClick={() => setOffset((o) => o + PAGE)}
          >
            下一頁
          </button>
        </div>
      </div>
    </>
  );
}
