"use client";

import { Amount } from "@/components/Amount";
import { LineChart } from "@/components/Charts";
import { TopBar } from "@/components/TopBar";
import { useSession } from "@/lib/auth-client";
import { toMajor } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ForecastPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();

  const projection = trpc.forecast.projection.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const categories = trpc.categories.list.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const [defaultLiving, setDefaultLiving] = useState("");
  const [horizon, setHorizon] = useState("12");
  const [livingCats, setLivingCats] = useState<string[] | null>(null);
  const [editMonth, setEditMonth] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const updateSettings = trpc.forecast.updateSettings.useMutation({
    onSuccess: () => utils.forecast.projection.invalidate(),
  });
  const setEstimate = trpc.forecast.setLivingEstimate.useMutation({
    onSuccess: () => {
      utils.forecast.projection.invalidate();
      setEditMonth(null);
    },
  });
  const syncActual = trpc.forecast.syncLivingActual.useMutation({
    onSuccess: () => utils.forecast.projection.invalidate(),
  });

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  useEffect(() => {
    if (projection.data && !defaultLiving) {
      const d = projection.data.defaultLivingExpenseMinor;
      setDefaultLiving(String(Number(d) / 100));
      setHorizon(String(projection.data.horizonMonths));
    }
  }, [projection.data, defaultLiving]);

  useEffect(() => {
    if (projection.data && livingCats === null) {
      setLivingCats(projection.data.livingExpenseCategoryIds);
    }
  }, [projection.data, livingCats]);

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container muted">載入中…</div>
      </>
    );
  }

  const data = projection.data;
  const base = data?.baseCurrency ?? "TWD";

  return (
    <>
      <TopBar />
      <div className="container">
        <h2 style={{ marginTop: 0 }}>資產預估</h2>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          依薪資、排程、分期、貸款與生活費，推算未來淨資產。生活費可設預設值，記帳後可寫入實際。
        </p>

        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            updateSettings.mutate({
              defaultLivingExpense: defaultLiving || "0",
              horizonMonths: Number(horizon) || 12,
              livingExpenseCategoryIds: livingCats ?? [],
            });
          }}
        >
          <div className="grid cols-3">
            <label>
              每月生活費預設
              <input
                inputMode="decimal"
                value={defaultLiving}
                onChange={(e) => setDefaultLiving(e.target.value)}
                placeholder="30000"
              />
            </label>
            <label>
              預估月數
              <input
                inputMode="numeric"
                min={3}
                max={60}
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
              />
            </label>
            <label style={{ justifyContent: "flex-end" }}>
              <span>&nbsp;</span>
              <button className="btn" type="submit" disabled={updateSettings.isPending}>
                儲存預設
              </button>
            </label>
          </div>

          <div>
            <span className="secondary" style={{ fontSize: 13 }}>
              生活費計入的分類（「寫入實際」時用）— 不選＝所有手動支出都算
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 8,
              }}
            >
              {(categories.data ?? [])
                .filter((c) => c.kind === "expense")
                .map((c) => {
                  const selected = (livingCats ?? []).includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className={`chip${selected ? " chip-on" : ""}`}
                      onClick={() =>
                        setLivingCats((prev) => {
                          const cur = prev ?? [];
                          return cur.includes(c.id)
                            ? cur.filter((x) => x !== c.id)
                            : [...cur, c.id];
                        })
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
            </div>
          </div>
        </form>

        {projection.isLoading ? (
          <div className="muted">載入中…</div>
        ) : data ? (
          <>
            <div className="grid cols-2" style={{ marginTop: 16 }}>
              <div className="card">
                <h3>目前淨資產</h3>
                <Amount value={data.currentNetWorthMinor} currency={base} kind="auto" variant="stat" />
              </div>
              <div className="card">
                <h3>{data.months.at(-1)?.month} 預估淨資產</h3>
                <Amount
                  value={data.months.at(-1)?.projectedNetWorthMinor ?? 0n}
                  currency={base}
                  kind="income"
                  variant="stat"
                />
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <h3>預估淨資產走勢</h3>
              <LineChart
                points={data.months.map((m) => ({
                  label: m.month.slice(5),
                  value: toMajor(m.projectedNetWorthMinor, base),
                }))}
                currency={base}
                color="var(--accent)"
              />
            </div>

            <div className="section-title">逐月預估</div>
            <div className="table-scroll">
            <div className="list forecast-table">
              <div className="row forecast-head">
                <span>月份</span>
                <span>固定收入</span>
                <span>固定支出</span>
                <span>生活費</span>
                <span>淨流</span>
                <span>預估淨資產</span>
                <span></span>
              </div>
              {data.months.map((row) => (
                <div className="row forecast-row" key={row.month}>
                  <span className="primary">{row.month}</span>
                  <Amount
                    value={row.scheduledIncomeMinor}
                    currency={base}
                    kind="income"
                    signed
                    variant="inline"
                  />
                  <Amount
                    value={row.scheduledExpenseMinor}
                    currency={base}
                    kind="expense"
                    signed
                    variant="inline"
                  />
                  <span>
                    {editMonth === row.month ? (
                      <input
                        className="forecast-input"
                        inputMode="decimal"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setEstimate.mutate({ month: row.month, amount: editAmount });
                          }
                        }}
                      />
                    ) : (
                      <>
                        <Amount
                          value={row.livingExpenseMinor}
                          currency={base}
                          kind="expense"
                          variant="inline"
                        />
                        {row.isActual && (
                          <span className="badge income" style={{ marginLeft: 6 }}>
                            實際
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <Amount
                    value={row.netCashflowMinor}
                    currency={base}
                    kind="auto"
                    signed
                    variant="inline"
                  />
                  <span style={{ minWidth: 0 }}>
                    <Amount
                      value={row.projectedNetWorthMinor}
                      currency={base}
                      kind="auto"
                      variant="inline"
                    />
                    {row.rsuVestValueMinor > 0n && (
                      <span className="badge income" style={{ marginLeft: 6 }} title="本月 RSU 入帳市值">
                        RSU +<Amount value={row.rsuVestValueMinor} currency={base} kind="income" variant="inline" />
                      </span>
                    )}
                  </span>
                  <span className="row-inline" style={{ gap: 4 }}>
                    {editMonth === row.month ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          setEstimate.mutate({ month: row.month, amount: editAmount })
                        }
                      >
                        存
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setEditMonth(row.month);
                          setEditAmount(String(Number(row.livingExpenseMinor) / 100));
                        }}
                      >
                        改
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      title="從記帳寫入（排除薪資扣款、排程、分期）"
                      onClick={() => syncActual.mutate({ month: row.month })}
                    >
                      寫入實際
                    </button>
                  </span>
                </div>
              ))}
            </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
