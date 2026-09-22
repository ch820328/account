"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Amount } from "@/components/Amount";
import { LineChart, DonutChart, type DonutSegment } from "@/components/Charts";
import { Skeleton, SkeletonList } from "@/components/Skeleton";
import { useSession } from "@/lib/auth-client";
import { fmt, toMajor } from "@/lib/format";
import { trpc } from "@/lib/trpc";

// Dual line/area chart for 12-Month Income vs Expense (Dynamic 1:1 Pixel Ratio)
function AnnualTrendChart({
  points,
  baseCurrency,
  height = 240,
}: {
  points: { month: string; incomeMinor: bigint; expenseMinor: bigint }[];
  baseCurrency: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) {
    return <div className="muted" style={{ padding: 24, textAlign: "center" }}>資料累積不足，尚無法繪製趨勢圖。</div>;
  }

  const W = Math.max(320, containerWidth);
  const H = height;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 32;

  const incomeVals = points.map((p) => toMajor(p.incomeMinor, baseCurrency));
  const expenseVals = points.map((p) => toMajor(p.expenseMinor, baseCurrency));

  const allVals = [...incomeVals, ...expenseVals];
  const max = Math.max(...allVals, 1);
  const min = 0;
  const span = max - min || 1;

  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;

  const x = (i: number) => padLeft + (innerW * i) / (points.length - 1);
  const y = (v: number) => padTop + innerH - (innerH * (v - min)) / span;

  const incLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(incomeVals[i]!)}`).join(" ");
  const incArea = `${incLine} L${x(points.length - 1)},${padTop + innerH} L${x(0)},${padTop + innerH} Z`;

  const expLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(expenseVals[i]!)}`).join(" ");
  const expArea = `${expLine} L${x(points.length - 1)},${padTop + innerH} L${x(0)},${padTop + innerH} Z`;

  const formatYTick = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${Math.round(val / 1000)}k`;
    return Math.round(val).toString();
  };

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <defs>
          <linearGradient id="annual-inc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="annual-exp-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const yPos = padTop + innerH * (1 - ratio);
          const val = min + span * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                y1={yPos}
                x2={W - padRight}
                y2={yPos}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={yPos + 4}
                fontSize={11}
                fontFamily="system-ui, -apple-system, sans-serif"
                fill="var(--muted)"
                textAnchor="end"
                opacity={0.7}
              >
                {formatYTick(val)}
              </text>
            </g>
          );
        })}

        {/* Income Area & Line */}
        <path d={incArea} fill="url(#annual-inc-grad)" />
        <path d={incLine} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinejoin="round" />

        {/* Expense Area & Line */}
        <path d={expArea} fill="url(#annual-exp-grad)" />
        <path d={expLine} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" />

        {/* Hover guide line */}
        {hoveredIdx !== null && (
          <line
            x1={x(hoveredIdx)}
            y1={padTop}
            x2={x(hoveredIdx)}
            y2={padTop + innerH}
            stroke="rgba(255, 255, 255, 0.3)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
        )}

        {/* Data points & X Labels */}
        {points.map((p, i) => {
          const isHovered = hoveredIdx === i;
          return (
            <g key={p.month}>
              {/* Invisible interactive hover bar */}
              <rect
                x={x(i) - innerW / (points.length * 2)}
                y={padTop}
                width={innerW / points.length}
                height={innerH + padBottom}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredIdx(i)}
              />

              <circle
                cx={x(i)}
                cy={y(incomeVals[i]!)}
                r={isHovered ? 5.5 : 3.5}
                fill="#10b981"
                stroke="#0f172a"
                strokeWidth={isHovered ? 2 : 1}
                style={{ transition: "r 0.15s ease" }}
              />
              <circle
                cx={x(i)}
                cy={y(expenseVals[i]!)}
                r={isHovered ? 5.5 : 3.5}
                fill="#f59e0b"
                stroke="#0f172a"
                strokeWidth={isHovered ? 2 : 1}
                style={{ transition: "r 0.15s ease" }}
              />
              <text
                x={x(i)}
                y={H - 10}
                fontSize={11}
                fontFamily="system-ui, -apple-system, sans-serif"
                fontWeight={isHovered ? 700 : 500}
                fill={isHovered ? "#38bdf8" : "var(--muted)"}
                textAnchor="middle"
              >
                {p.month.includes("-") ? `${Number(p.month.split("-")[1])}月` : p.month}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Interactive Tooltip Card */}
      {hoveredPoint && hoveredIdx !== null && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: Math.min(Math.max(x(hoveredIdx), 120), W - 120),
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 700, color: "#f8fafc", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 4 }}>
            {hoveredPoint.month.includes("-")
              ? `${hoveredPoint.month.split("-")[0]} 年 ${Number(hoveredPoint.month.split("-")[1])} 月`
              : hoveredPoint.month}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span style={{ color: "#10b981", fontWeight: 600 }}>每月收入：</span>
            <span style={{ fontFamily: "monospace", color: "#10b981", fontWeight: 600 }}>{fmt(hoveredPoint.incomeMinor, baseCurrency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>每月支出：</span>
            <span style={{ fontFamily: "monospace", color: "#f59e0b", fontWeight: 600 }}>{fmt(hoveredPoint.expenseMinor, baseCurrency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, paddingTop: 3, borderTop: "1px dashed rgba(255,255,255,0.1)" }}>
            <span style={{ color: "var(--muted)" }}>結餘差額：</span>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                color: hoveredPoint.incomeMinor >= hoveredPoint.expenseMinor ? "#38bdf8" : "#f43f5e",
              }}
            >
              {hoveredPoint.incomeMinor >= hoveredPoint.expenseMinor ? "+" : ""}
              {fmt(hoveredPoint.incomeMinor - hoveredPoint.expenseMinor, baseCurrency)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [targetYear, setTargetYear] = useState<number>(currentYear);
  const [trendTab, setTrendTab] = useState<"dual" | "savings">("dual");
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [hoveredCategoryIdx, setHoveredCategoryIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!isPending && !session?.user) router.replace("/login");
  }, [isPending, session, router]);

  // Queries
  const annualBreakdownQuery = trpc.transactions.annualBreakdown.useQuery(
    { year: targetYear },
    { enabled: !!session?.user }
  );

  const categoryTotalsQuery = trpc.transactions.categoryTotals.useQuery(
    { year: targetYear },
    { enabled: !!session?.user }
  );

  const historyQuery = trpc.transactions.history.useQuery(undefined, {
    enabled: !!session?.user,
  });

  if (isPending || !session?.user) {
    return (
      <>
        <TopBar />
        <div className="container" style={{ padding: 24 }}>
          <Skeleton width={180} height={32} style={{ marginBottom: 20 }} />
          <SkeletonList rows={4} />
        </div>
      </>
    );
  }

  const base = annualBreakdownQuery.data?.baseCurrency ?? "TWD";
  const breakdown = annualBreakdownQuery.data;

  // Filter and prepare 12 calendar months for targetYear from history
  const allHistoryMonths = historyQuery.data?.months ?? [];
  const yearPrefix = `${targetYear}-`;

  // Build full 12 months array for targetYear
  const monthsData = Array.from({ length: 12 }, (_, idx) => {
    const mNum = String(idx + 1).padStart(2, "0");
    const mKey = `${targetYear}-${mNum}`;
    const matched = allHistoryMonths.find((h) => h.month === mKey);

    return {
      month: mKey,
      monthLabel: `${idx + 1} 月`,
      incomeMinor: matched?.incomeMinor ?? 0n,
      expenseMinor: matched?.expenseMinor ?? 0n,
      netMinor: matched?.netMinor ?? 0n,
      endCashMinor: matched?.endCashMinor ?? 0n,
      hasData: Boolean(matched),
    };
  });

  // Annual Totals
  const totalIncome = breakdown ? breakdown.incomeMinor : monthsData.reduce((s, m) => s + m.incomeMinor, 0n);
  const totalExpense = breakdown ? breakdown.expenseMinor : monthsData.reduce((s, m) => s + m.expenseMinor, 0n);
  const netSavings = totalIncome - totalExpense;
  const annualSavingsRate =
    totalIncome > 0n
      ? Number(((totalIncome - totalExpense) * 10000n) / totalIncome) / 100
      : 0;

  // Active months count (months with records)
  const activeMonths = monthsData.filter((m) => m.incomeMinor > 0n || m.expenseMinor > 0n);
  const activeMonthsCount = Math.max(1, activeMonths.length);

  const avgMonthlyIncome = totalIncome / BigInt(activeMonthsCount);
  const avgMonthlyExpense = totalExpense / BigInt(activeMonthsCount);

  // Latest end of month cash for this year
  const recordedMonthsDesc = [...monthsData].reverse().filter((m) => m.hasData && m.endCashMinor > 0n);
  const latestCashMinor = recordedMonthsDesc[0]?.endCashMinor ?? 0n;

  // Best & Peak months
  const maxIncomeMonth = activeMonths.reduce((best, m) => (m.incomeMinor > (best?.incomeMinor ?? 0n) ? m : best), activeMonths[0]);
  const maxExpenseMonth = activeMonths.reduce((best, m) => (m.expenseMinor > (best?.expenseMinor ?? 0n) ? m : best), activeMonths[0]);

  // Savings Points for LineChart
  const savingsPoints = monthsData.map((m) => {
    const rate =
      m.incomeMinor > 0n
        ? Number(((m.incomeMinor - m.expenseMinor) * 10000n) / m.incomeMinor) / 100
        : 0;
    return { label: m.monthLabel, value: Math.max(-100, Math.min(100, rate)) };
  });

  // Categories list
  const categoryList = categoryTotalsQuery.data?.totals ?? [];
  const categoryTotalMinor = categoryList.reduce((s, c) => s + c.expenseMinor, 0n);
  const categoryMaxMinor = categoryList.reduce((m, c) => (c.expenseMinor > m ? c.expenseMinor : m), 0n);

  const CATEGORY_PALETTE = [
    "#38bdf8", // Sky blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#a855f7", // Purple
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#64748b", // Slate (other)
  ];

  const categoryDonutSegments: DonutSegment[] = (() => {
    if (!categoryList || categoryList.length === 0 || categoryTotalMinor <= 0n) {
      return [];
    }
    const topCount = 5;
    const topList = categoryList.slice(0, topCount);
    const remainder = categoryList.slice(topCount);

    const segments: DonutSegment[] = topList.map((c, idx) => ({
      label: c.name,
      value: Number(c.expenseMinor) / 100,
      formattedValue: fmt(c.expenseMinor, base),
      color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]!,
    }));

    if (remainder.length > 0) {
      const remainderMinor = remainder.reduce((s, c) => s + c.expenseMinor, 0n);
      if (remainderMinor > 0n) {
        segments.push({
          label: `其他 (${remainder.length} 個分類)`,
          value: Number(remainderMinor) / 100,
          formattedValue: fmt(remainderMinor, base),
          color: CATEGORY_PALETTE[topCount % CATEGORY_PALETTE.length]!,
        });
      }
    }

    return segments;
  })();

  return (
    <>
      <TopBar />
      <div className="container" style={{ paddingBottom: 60 }}>
        {/* Header & Year Navigation Toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 20,
            padding: "16px 20px",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 24 }}>📊</span>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                {targetYear} 年度財務決算與資產報告
              </h1>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              全年度收支總覽、12 個月現金流軌跡、資金結構分項與各大分類決算排行（基準幣別：{base}）
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Year Navigator Controls */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 8,
                padding: "2px 4px",
              }}
            >
              <button
                type="button"
                className="btn ghost"
                onClick={() => setTargetYear((y) => y - 1)}
                style={{ padding: "4px 8px", fontSize: 12 }}
                title="前一年"
              >
                ◀
              </button>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  padding: "4px 10px",
                  color: "#38bdf8",
                  letterSpacing: "0.5px",
                }}
              >
                {targetYear} 年度
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setTargetYear((y) => y + 1)}
                style={{ padding: "4px 8px", fontSize: 12 }}
                title="後一年"
              >
                ▶
              </button>
            </div>

            {targetYear !== currentYear && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => setTargetYear(currentYear)}
                style={{ fontSize: 12, padding: "5px 10px", color: "var(--accent)" }}
              >
                回到今年 ({currentYear})
              </button>
            )}

            <Link
              href="/budgets"
              className="btn ghost"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(255, 255, 255, 0.05)",
              }}
            >
              <span>📅</span>
              <span>年度預算管理</span>
            </Link>
          </div>
        </div>

        {/* Top 4 Annual Executive KPI Metric Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* Card 1: Annual Total Income */}
          <div
            className="ff3-card"
            style={{
              padding: "18px 20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "rgba(16, 185, 129, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                {targetYear} 年度總收入
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                全年度累計
              </span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "monospace",
                color: "var(--income)",
              }}
            >
              <Amount value={totalIncome} currency={base} kind="income" />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              月均收入約 <span style={{ color: "var(--income)", fontWeight: 600 }}>{fmt(avgMonthlyIncome, base)}</span>/月
            </div>
          </div>

          {/* Card 2: Annual Total Expense */}
          <div
            className="ff3-card"
            style={{
              padding: "18px 20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "rgba(245, 158, 11, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                {targetYear} 年度總支出
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                }}
              >
                全年度開銷
              </span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "monospace",
                color: "var(--expense)",
              }}
            >
              <Amount value={totalExpense} currency={base} kind="expense" />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              月均支出約 <span style={{ color: "var(--expense)", fontWeight: 600 }}>{fmt(avgMonthlyExpense, base)}</span>/月
            </div>
          </div>

          {/* Card 3: Annual Net Savings */}
          <div
            className="ff3-card"
            style={{
              padding: "18px 20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: netSavings >= 0n ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                {targetYear} 年度淨儲蓄結餘
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  background: netSavings >= 0n ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: netSavings >= 0n ? "#10b981" : "#ef4444",
                  border: netSavings >= 0n ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                儲蓄率 {annualSavingsRate.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "monospace",
                color: netSavings >= 0n ? "var(--income)" : "var(--expense)",
              }}
            >
              {netSavings > 0n ? "+" : ""}
              <Amount value={netSavings} currency={base} kind="auto" />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              總收入 − 總支出 累積資產淨成長
            </div>
          </div>

          {/* Card 4: Year-End Cash Position & Health Rating */}
          <div
            className="ff3-card"
            style={{
              padding: "18px 20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>
                期末流動現金水位
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  background:
                    annualSavingsRate >= 30
                      ? "rgba(16, 185, 129, 0.15)"
                      : annualSavingsRate >= 10
                      ? "rgba(56, 189, 248, 0.15)"
                      : "rgba(245, 158, 11, 0.15)",
                  color:
                    annualSavingsRate >= 30
                      ? "#10b981"
                      : annualSavingsRate >= 10
                      ? "#38bdf8"
                      : "#fbbf24",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                {annualSavingsRate >= 30
                  ? "🌟 儲蓄力優異"
                  : annualSavingsRate >= 10
                  ? "🛡️ 穩健平穩"
                  : "⚠️ 支出偏高"}
              </span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "monospace",
                color: "#60a5fa",
              }}
            >
              <Amount value={latestCashMinor} currency={base} kind="auto" />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              資產帳戶活存與現金總儲備
            </div>
          </div>
        </div>

        {/* Section 1: 12-Month Annual Cashflow & Savings Rate Trends */}
        <div
          className="ff3-card"
          style={{
            padding: "22px 24px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>📈</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {targetYear} 全年度 12 個月收支走勢與儲蓄評估
                </h2>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                洞察每期現金流波動、高支出週期與資產蓄水池成長速度
              </div>
            </div>

            {/* Trend Switcher */}
            <div
              style={{
                display: "inline-flex",
                background: "rgba(0, 0, 0, 0.3)",
                padding: "3px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <button
                type="button"
                className={`btn ghost ${trendTab === "dual" ? "active" : ""}`}
                onClick={() => setTrendTab("dual")}
                style={{
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: trendTab === "dual" ? "rgba(255, 255, 255, 0.12)" : "transparent",
                  color: trendTab === "dual" ? "#38bdf8" : "var(--muted)",
                  fontWeight: trendTab === "dual" ? 700 : 500,
                }}
              >
                📊 12 個月收支疊加走勢
              </button>
              <button
                type="button"
                className={`btn ghost ${trendTab === "savings" ? "active" : ""}`}
                onClick={() => setTrendTab("savings")}
                style={{
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: trendTab === "savings" ? "rgba(255, 255, 255, 0.12)" : "transparent",
                  color: trendTab === "savings" ? "#10b981" : "var(--muted)",
                  fontWeight: trendTab === "savings" ? 700 : 500,
                }}
              >
                🌱 每月儲蓄率變化 (%)
              </button>
            </div>
          </div>

          {trendTab === "dual" ? (
            <div>
              {/* Legend & Summary Badges */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 14,
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 3, background: "#10b981", borderRadius: 2 }} />
                    <span style={{ color: "#10b981", fontWeight: 600 }}>每月收入 (Income)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 3, background: "#f59e0b", borderRadius: 2 }} />
                    <span style={{ color: "#f59e0b", fontWeight: 600 }}>每月支出 (Expense)</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {maxIncomeMonth && maxIncomeMonth.incomeMinor > 0n && (
                    <span style={{ color: "var(--muted)" }}>
                      🏆 最高收入：<strong style={{ color: "#10b981" }}>{maxIncomeMonth.monthLabel}</strong> ({fmt(maxIncomeMonth.incomeMinor, base)})
                    </span>
                  )}
                  {maxExpenseMonth && maxExpenseMonth.expenseMinor > 0n && (
                    <span style={{ color: "var(--muted)" }}>
                      ⚡ 最高支出：<strong style={{ color: "#f59e0b" }}>{maxExpenseMonth.monthLabel}</strong> ({fmt(maxExpenseMonth.expenseMinor, base)})
                    </span>
                  )}
                </div>
              </div>

              <AnnualTrendChart points={monthsData} baseCurrency={base} height={230} />
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 12,
                  fontSize: 12,
                }}
              >
                <div style={{ color: "var(--muted)" }}>
                  計算公式：（收入 − 支出）÷ 收入 × 100% · 負值代表當月開銷超出收入
                </div>
                <div style={{ fontWeight: 600 }}>
                  全年度平均儲蓄率：
                  <span style={{ color: annualSavingsRate >= 0 ? "var(--income)" : "var(--expense)", marginLeft: 4 }}>
                    {annualSavingsRate >= 0 ? "+" : ""}{annualSavingsRate.toFixed(1)}%
                  </span>
                </div>
              </div>

              <LineChart
                points={savingsPoints}
                currency="%"
                color="#10b981"
                height={220}
              />
            </div>
          )}
        </div>

        {/* Section 2: Annual Category Expense Rankings & Donut Distribution */}
        <div
          className="ff3-card"
          style={{
            padding: "22px 24px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>🍰</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {targetYear} 全年度各大分類支出佔比與排行榜
                </h2>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                全年度各消費類別累計支出佔比、排行榜與月平均支出水平
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                年度分類支出總計：
                <strong style={{ fontSize: 16, color: "var(--expense)", fontFamily: "monospace", marginLeft: 6 }}>
                  {fmt(categoryTotalMinor, base)}
                </strong>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "var(--muted)",
                }}
              >
                共計 {categoryList.length} 個消費分類
              </span>
            </div>
          </div>

          {categoryTotalsQuery.isLoading ? (
            <SkeletonList rows={4} />
          ) : categoryList.length === 0 ? (
            <div
              style={{
                padding: "36px 16px",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: 13,
                background: "rgba(0,0,0,0.15)",
                borderRadius: 8,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏷️</div>
              {targetYear} 年度尚無任何已記錄之分類支出。
            </div>
          ) : (
            <div className="reports-category-grid">
              {/* Left Column: Donut Chart Distribution */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px 22px",
                  background: "rgba(0, 0, 0, 0.2)",
                  borderRadius: 12,
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 18, alignSelf: "flex-start" }}>
                  主要消費大類佔比分佈
                </div>
                <DonutChart
                  size={260}
                  segments={categoryDonutSegments}
                  centerLabel="全年度支出"
                  centerValue={fmt(categoryTotalMinor, base)}
                  externalHoveredIdx={hoveredCategoryIdx}
                  onHoverChange={setHoveredCategoryIdx}
                />

                {/* Loan Repayments Transfer Callout */}
                {breakdown && breakdown.loanTransfer > 0n && (
                  <div
                    style={{
                      marginTop: 24,
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.22)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#38bdf8" }}>
                        🏦 全年度房貸/個人貸款還款本息：{fmt(breakdown.loanTransfer, base)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        此項目為資產負債平衡轉帳（還本金與繳息），獨立呈現於現金流，不重複計入日常生活純消費。
                      </div>
                    </div>
                    <Link
                      href="/budgets"
                      style={{
                        fontSize: 11,
                        padding: "4px 8px",
                        borderRadius: 4,
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      查看房貸預算 ↗
                    </Link>
                  </div>
                )}
              </div>

              {/* Right Column: Category Rankings List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
                    全年度分類排行明細
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    顯示前 6 大類 · 滾動查看全部（共 {categoryList.length} 類）
                  </span>
                </div>

                <div
                  className="custom-scrollbar"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 385,
                    overflowY: "auto",
                    paddingRight: 6,
                  }}
                >
                  {categoryList.map((c, idx) => {
                    const pct =
                      categoryTotalMinor > 0n
                        ? Number((c.expenseMinor * 1000n) / categoryTotalMinor) / 10
                        : 0;
                    const maxPct =
                      categoryMaxMinor > 0n
                        ? Number((c.expenseMinor * 100n) / categoryMaxMinor)
                        : 0;
                    const monthlyAvg = c.expenseMinor / BigInt(activeMonthsCount);

                    const rankBadge =
                      idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;

                    const itemColor =
                      idx < 5
                        ? CATEGORY_PALETTE[idx]
                        : idx < 7
                        ? CATEGORY_PALETTE[idx]
                        : "rgba(255, 255, 255, 0.35)";

                    const isHovered = hoveredCategoryIdx === (idx < 5 ? idx : 5);

                    return (
                      <div
                        key={c.name}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 8,
                          background: isHovered ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                          border: isHovered
                            ? "1px solid rgba(56, 189, 248, 0.35)"
                            : "1px solid rgba(255, 255, 255, 0.05)",
                          transition: "all 0.15s ease",
                          cursor: "pointer",
                        }}
                        className="hover-row"
                        onMouseEnter={() => setHoveredCategoryIdx(idx < 5 ? idx : 5)}
                        onMouseLeave={() => setHoveredCategoryIdx(null)}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 5,
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, width: 22, textAlign: "center", fontWeight: 700 }}>
                              {rankBadge}
                            </span>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: itemColor,
                                display: "inline-block",
                                flexShrink: 0,
                                boxShadow: isHovered ? `0 0 6px ${itemColor}` : undefined,
                              }}
                            />
                            <div>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: isHovered ? "#f8fafc" : "var(--fg)" }}>
                                {c.name}
                              </span>
                              {c.parentName && c.parentName !== c.name && (
                                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 6 }}>
                                  ({c.parentName})
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                              月均約 {fmt(monthlyAvg, base)}/月
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 700,
                                  fontFamily: "monospace",
                                  color: "var(--expense)",
                                }}
                              >
                                {fmt(c.expenseMinor, base)}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(255, 255, 255, 0.06)",
                                  color: "var(--muted)",
                                  minWidth: 46,
                                  textAlign: "right",
                                }}
                              >
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Proportional Bar */}
                        <div className="bar-track" style={{ height: 5, borderRadius: 3 }}>
                          <div
                            className="bar-fill"
                            style={{
                              width: `${maxPct}%`,
                              background: itemColor,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: 12-Month Annual Financial Ledger */}
        <div
          className="ff3-card"
          style={{
            padding: "22px 24px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>🗓️</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {targetYear} 年度 12 個月月度收支決算表
                </h2>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                逐月核對實際現金資產變動、期末結存水位與當月重點消費細項
              </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              點選展開任一月份可檢視該月分類明細
            </div>
          </div>

          {historyQuery.isLoading ? (
            <SkeletonList rows={6} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {monthsData.map((mo) => {
                const net = mo.incomeMinor - mo.expenseMinor;
                const isOpen = openMonth === mo.month;
                const savingsRate =
                  mo.incomeMinor > 0n
                    ? Number(((mo.incomeMinor - mo.expenseMinor) * 10000n) / mo.incomeMinor) / 100
                    : 0;

                return (
                  <div
                    key={mo.month}
                    style={{
                      borderRadius: 8,
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      background: "rgba(255, 255, 255, 0.02)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                      onClick={() => setOpenMonth(isOpen ? null : mo.month)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: "monospace",
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "var(--fg)",
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          {mo.month}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          ({mo.monthLabel})
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          flexWrap: "wrap",
                          fontSize: 13,
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>收</span>
                          <span style={{ color: "var(--income)", fontWeight: 600, fontFamily: "monospace" }}>
                            {fmt(mo.incomeMinor, base)}
                          </span>
                        </div>

                        <div>
                          <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>支</span>
                          <span style={{ color: "var(--expense)", fontWeight: 600, fontFamily: "monospace" }}>
                            {fmt(mo.expenseMinor, base)}
                          </span>
                        </div>

                        <div style={{ minWidth: 90, textAlign: "right" }}>
                          <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>結餘</span>
                          <span
                            style={{
                              color: net >= 0n ? "var(--income)" : "var(--expense)",
                              fontWeight: 700,
                              fontFamily: "monospace",
                            }}
                          >
                            {net > 0n ? "+" : ""}
                            {fmt(net, base)}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: net >= 0n ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                            color: net >= 0n ? "#10b981" : "#ef4444",
                            fontWeight: 600,
                            minWidth: 54,
                            textAlign: "center",
                          }}
                        >
                          {savingsRate >= 0 ? `+${savingsRate.toFixed(0)}%` : `${savingsRate.toFixed(0)}%`}
                        </div>

                        <div style={{ minWidth: 120, textAlign: "right" }}>
                          <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>月底現金</span>
                          <span style={{ fontWeight: 600, fontFamily: "monospace", color: "#60a5fa" }}>
                            {mo.endCashMinor > 0n ? fmt(mo.endCashMinor, base) : "—"}
                          </span>
                        </div>

                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          padding: "14px 16px",
                          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                          background: "rgba(0, 0, 0, 0.2)",
                        }}
                      >
                        <MonthDetail month={mo.month} base={base} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Annual Summary Footer Row */}
              <div
                style={{
                  marginTop: 8,
                  padding: "14px 16px",
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#38bdf8" }}>
                  🌟 {targetYear} 年度總計決算
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
                  <div>
                    <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>總收入</span>
                    <strong style={{ color: "var(--income)", fontFamily: "monospace" }}>{fmt(totalIncome, base)}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>總支出</span>
                    <strong style={{ color: "var(--expense)", fontFamily: "monospace" }}>{fmt(totalExpense, base)}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--muted)", fontSize: 11, marginRight: 4 }}>總淨結餘</span>
                    <strong style={{ color: netSavings >= 0n ? "var(--income)" : "var(--expense)", fontFamily: "monospace" }}>
                      {netSavings > 0n ? "+" : ""}{fmt(netSavings, base)}
                    </strong>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: netSavings >= 0n ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                      color: netSavings >= 0n ? "#10b981" : "#ef4444",
                      fontWeight: 700,
                    }}
                  >
                    年度儲蓄率 {annualSavingsRate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MonthDetail({ month, base }: { month: string; base: string }) {
  const detail = trpc.transactions.monthCategories.useQuery({ month });
  if (detail.isLoading) return <SkeletonList rows={2} />;
  if (!detail.data?.totals.length) {
    return <div className="muted" style={{ fontSize: 12 }}>此月份無已記錄之消費支出。</div>;
  }

  const max = detail.data.totals.reduce((m, c) => (c.expenseMinor > m ? c.expenseMinor : m), 0n);
  const total = detail.data.totals.reduce((s, c) => s + c.expenseMinor, 0n);

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600 }}>
        {month} 月份各大類消費細項分佈（合計 {fmt(total, base)}）：
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
        {detail.data.totals.map((c) => {
          const pct = max > 0n ? Number((c.expenseMinor * 100n) / max) : 0;
          const share = total > 0n ? Number((c.expenseMinor * 1000n) / total) / 10 : 0;
          return (
            <div
              key={c.name}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.04)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: "var(--expense)", fontWeight: 600, fontFamily: "monospace" }}>
                    {fmt(c.expenseMinor, base)}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)" }}>({share.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="bar-track" style={{ height: 4, borderRadius: 2 }}>
                <div className="bar-fill" style={{ width: `${pct}%`, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
