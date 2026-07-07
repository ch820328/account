"use client";

import { Amount } from "@/components/Amount";
import { LineChart } from "@/components/Charts";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { fmt, toMajor } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ReportsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const trend = trpc.transactions.trend.useQuery({ months: 12 }, { enabled: !!session?.user });
  const cats = trpc.transactions.categoryTotals.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const history = trpc.transactions.history.useQuery(undefined, { enabled: !!session?.user });
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  const base = trend.data?.baseCurrency ?? "TWD";
  const points = trend.data?.points ?? [];
  const totalIncome = points.reduce((s, p) => s + p.incomeMinor, 0n);
  const totalExpense = points.reduce((s, p) => s + p.expenseMinor, 0n);

  const catTotals = cats.data?.totals ?? [];
  const catMax = catTotals.reduce((m, c) => (c.expenseMinor > m ? c.expenseMinor : m), 0n);
  const year = new Date().getFullYear();

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>報表</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          近 12 個月收支趨勢與今年分類支出（換算為 {base}）。
        </p>

        <div className="grid cols-2">
          <div className="card">
            <h3>近 12 月收入</h3>
            <Amount value={totalIncome} currency={base} kind="income" variant="stat" />
          </div>
          <div className="card">
            <h3>近 12 月支出</h3>
            <Amount value={totalExpense} currency={base} kind="expense" variant="stat" />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>每月收入</h3>
          <LineChart
            points={points.map((p) => ({ label: p.month.slice(2), value: toMajor(p.incomeMinor, base) }))}
            currency={base}
            color="var(--income)"
          />
          <h3 style={{ marginTop: 16 }}>每月支出</h3>
          <LineChart
            points={points.map((p) => ({ label: p.month.slice(2), value: toMajor(p.expenseMinor, base) }))}
            currency={base}
            color="var(--expense)"
          />
        </div>

        <div className="section-title">本月預算</div>
        <BudgetSection base={base} />

        <div className="section-title">每月核對</div>
        {history.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !history.data?.months.length ? (
          <div className="muted">尚無紀錄。</div>
        ) : (
          <div className="list">
            {history.data.months.map((mo) => (
              <div className={`list-item${openMonth === mo.month ? " editing" : ""}`} key={mo.month}>
                <div
                  className="row"
                  style={{ cursor: "pointer" }}
                  onClick={() => setOpenMonth(openMonth === mo.month ? null : mo.month)}
                >
                  <div className="meta">
                    <span className="primary">{mo.month}</span>
                    <span className="secondary">
                      收 <Amount value={mo.incomeMinor} currency={base} kind="income" variant="inline" />
                      {" · "}支 <Amount value={mo.expenseMinor} currency={base} kind="expense" variant="inline" />
                    </span>
                  </div>
                  <div className="meta" style={{ alignItems: "flex-end" }}>
                    <span className="secondary">月底現金</span>
                    <Amount value={mo.endCashMinor} currency={base} kind="auto" />
                  </div>
                </div>
                {openMonth === mo.month && (
                  <div className="row-edit-panel">
                    <MonthDetail month={mo.month} base={base} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="section-title">{year} 年分類支出</div>
        {cats.isLoading ? (
          <div className="muted">載入中…</div>
        ) : !catTotals.length ? (
          <div className="muted">今年尚無支出紀錄。</div>
        ) : (
          <div className="card">
            {catTotals.map((c) => {
              const pct = catMax > 0n ? Number((c.expenseMinor * 100n) / catMax) : 0;
              return (
                <div key={c.name} style={{ marginBottom: 10 }}>
                  <div className="row-inline" style={{ justifyContent: "space-between", fontSize: 13 }}>
                    <span>{c.name}</span>
                    <span className="expense" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {fmt(c.expenseMinor, base)}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function BudgetSection({ base }: { base: string }) {
  const utils = trpc.useUtils();
  const budgets = trpc.budgets.list.useQuery();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const set = trpc.budgets.set.useMutation({ onSuccess: () => utils.budgets.list.invalidate() });
  const remove = trpc.budgets.remove.useMutation({
    onSuccess: () => utils.budgets.list.invalidate(),
  });

  if (budgets.isLoading) return <div className="muted">載入中…</div>;
  if (!budgets.data?.length) {
    return <div className="muted">尚無支出分類，先到分類管理新增。</div>;
  }

  return (
    <div className="card">
      {budgets.data.map((b) => {
        const hasBudget = b.budgetMinor != null && b.budgetMinor > 0n;
        const pct = hasBudget ? Number((b.actualMinor * 100n) / b.budgetMinor!) : 0;
        const over = hasBudget && b.actualMinor > b.budgetMinor!;
        const draft = drafts[b.categoryId] ?? (b.budgetMinor != null ? String(Number(b.budgetMinor) / 100) : "");
        return (
          <div key={b.categoryId} style={{ marginBottom: 14 }}>
            <div className="row-inline" style={{ justifyContent: "space-between", gap: 8 }}>
              <span>{b.name}</span>
              <span className="row-inline" style={{ gap: 6 }}>
                <input
                  inputMode="decimal"
                  value={draft}
                  placeholder="預算"
                  onChange={(e) => setDrafts((d) => ({ ...d, [b.categoryId]: e.target.value }))}
                  style={{ width: 110, padding: "4px 8px" }}
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => draft && set.mutate({ categoryId: b.categoryId, amount: draft })}
                >
                  存
                </button>
                {hasBudget && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => remove.mutate({ categoryId: b.categoryId })}
                  >
                    清除
                  </button>
                )}
              </span>
            </div>
            <div className="row-inline" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span className={over ? "expense" : "muted"}>
                已用 {fmt(b.actualMinor, base)}
                {hasBudget ? ` / ${fmt(b.budgetMinor!, base)}` : "（未設預算）"}
              </span>
              {hasBudget && (
                <span className={over ? "expense" : "income"}>
                  {over ? "超支 " : "剩餘 "}
                  {fmt(over ? b.actualMinor - b.budgetMinor! : b.budgetMinor! - b.actualMinor, base)}
                </span>
              )}
            </div>
            {hasBudget && (
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: over ? "var(--expense)" : "var(--income)",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthDetail({ month, base }: { month: string; base: string }) {
  const detail = trpc.transactions.monthCategories.useQuery({ month });
  if (detail.isLoading) return <div className="muted">載入中…</div>;
  if (!detail.data?.totals.length) return <div className="muted">本月無支出。</div>;
  const max = detail.data.totals.reduce((m, c) => (c.expenseMinor > m ? c.expenseMinor : m), 0n);
  return (
    <div>
      {detail.data.totals.map((c) => {
        const pct = max > 0n ? Number((c.expenseMinor * 100n) / max) : 0;
        return (
          <div key={c.name} style={{ marginBottom: 8 }}>
            <div className="row-inline" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>{c.name}</span>
              <span className="expense" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(c.expenseMinor, base)}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
