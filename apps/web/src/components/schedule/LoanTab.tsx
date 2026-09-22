"use client";

import { Amount } from "@/components/Amount";
import { AmountInput } from "@/components/AmountInput";
import { EditableRow } from "@/components/schedule/EditableRow";
import { trpc } from "@/lib/trpc";
import { isLiabilityType } from "@/lib/labels";
import { useEffect, useState, useMemo } from "react";
import { niceConfirm } from "@/lib/confirm";
import { fmt } from "@/lib/format";
import { LoanPrepaymentModal } from "./LoanPrepaymentModal";
import { LoanTaxReportModal } from "./LoanTaxReportModal";
import { usePersistentTab } from "@/lib/use-persistent-tab";

const VALID_LOAN_VIEWS = ["phases", "months12"] as const;

type AdjustmentDraft = { fromPeriod: string; toPeriod?: string; adjustmentYards: string };

type TierDraft = { fromPeriod: string; toPeriod: string; amount: string; rateMargin?: string; isGracePeriod?: boolean };

type LoanRow = {
  id: string;
  name: string;
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  nextRunDate: string;
  completedPeriods: number;
  totalPeriods: number | null;
  note: string | null;
  active: boolean;
  amortizationMethod: string;
  rateMargin: string;
  liabilityAccountId: string;
  sourceAccountId: string;
  tiers: { id: string; fromPeriod: number; toPeriod: number; amountMinor: bigint; rateMargin: string | null; isGracePeriod?: boolean }[];
  adjustments: { id: string; fromPeriod: number; toPeriod: number | null; adjustmentRate: string }[];
};

function toGracePeriodTier(gracePeriods: string): TierDraft[] {
  const p = Number(gracePeriods);
  if (!p || isNaN(p) || p <= 0) return [];
  return [{
    fromPeriod: "1",
    toPeriod: String(p),
    amount: "0",
    rateMargin: undefined,
    isGracePeriod: true,
  }];
}

function toTierPayload(tiers: TierDraft[], amortizationMethod: string) {
  const isFlat = amortizationMethod === "flat";
  return tiers
    .filter((t) => t.fromPeriod && t.toPeriod && (isFlat ? t.amount : (t.rateMargin || t.isGracePeriod)))
    .map((t) => ({
      fromPeriod: Number(t.fromPeriod),
      toPeriod: Number(t.toPeriod),
      amount: isFlat ? t.amount : "0",
      rateMargin: isFlat ? undefined : (t.rateMargin || "0"),
      isGracePeriod: t.isGracePeriod,
    }));
}

function AdjustmentEditor({
  adjustments,
  onChange,
}: {
  adjustments: AdjustmentDraft[];
  onChange: (t: AdjustmentDraft[]) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <span className="field-label">升降息紀錄（增減利率）— 1 碼 = 0.25% (半碼 = 0.125%)</span>
      {adjustments.map((a, i) => (
        <div className="tier-row" key={i}>
          <span className="muted">第</span>
          <input
            inputMode="numeric"
            placeholder="起"
            style={{ width: "50px" }}
            value={a.fromPeriod}
            onChange={(e) => onChange(adjustments.map((x, j) => (j === i ? { ...x, fromPeriod: e.target.value } : x)))}
          />
          <span className="muted">到</span>
          <input
            inputMode="numeric"
            placeholder="迄(選)"
            style={{ width: "60px" }}
            value={a.toPeriod || ""}
            onChange={(e) => onChange(adjustments.map((x, j) => (j === i ? { ...x, toPeriod: e.target.value } : x)))}
          />
          <span className="muted">期，調整：</span>
          <AmountInput
            placeholder="+1 / -0.5"
            style={{ width: "70px" }}
            value={a.adjustmentYards}
            onChange={(val) => onChange(adjustments.map((x, j) => (j === i ? { ...x, adjustmentYards: val } : x)))}
          />
          <span className="muted">碼</span>
          <span className="muted" style={{ fontSize: '12px' }}>
            (即 {a.adjustmentYards && !isNaN(Number(a.adjustmentYards)) ? (Number(a.adjustmentYards) * 0.25).toFixed(3) : 0}%)
          </span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => onChange(adjustments.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => onChange([...adjustments, { fromPeriod: "", toPeriod: "", adjustmentYards: "" }])}
      >
        + 新增升降息
      </button>
    </div>
  );
}

function toAdjustmentPayload(adjustments: AdjustmentDraft[]) {
  return adjustments
    .filter((a) => a.fromPeriod && a.adjustmentYards)
    .map((a) => ({
      fromPeriod: Number(a.fromPeriod),
      toPeriod: a.toPeriod ? Number(a.toPeriod) : undefined,
      adjustmentRate: String(Number(a.adjustmentYards) * 0.25),
    }));
}

function AmortizationPreview({
  owed, totalPeriods, baseRate, rateMargin, tiers, adjustments, method
}: { owed: string, totalPeriods: string, baseRate: string, rateMargin: string, tiers: TierDraft[], adjustments: AdjustmentDraft[], method: string }) {
  if (method === "flat" || !owed || !totalPeriods || !baseRate || !rateMargin) return null;
  const P = Number(owed.replace(/,/g, ""));
  const N = Number(totalPeriods);
  if (isNaN(P) || isNaN(N) || N <= 0) return null;

  const getTier = (period: number) => {
    if (tiers.length > 0) {
      const grace = tiers[0];
      if (grace && grace.isGracePeriod && period >= Number(grace.fromPeriod) && period <= Number(grace.toPeriod)) {
        return grace;
      }
    }
    return undefined;
  };

  const getAdjustment = (period: number) => {
    let total = 0;
    for (const a of adjustments) {
      if (a.fromPeriod && a.adjustmentYards) {
        if (period >= Number(a.fromPeriod) && (!a.toPeriod || period <= Number(a.toPeriod))) {
          total += Number(a.adjustmentYards) * 0.25;
        }
      }
    }
    return total;
  };

  const rows = [];
  let currentOwed = P;
  let totalPaymentAmount = 0;

  const keyPeriods = new Set([1, N]);
  tiers.forEach(t => { 
    if (t.fromPeriod) keyPeriods.add(Number(t.fromPeriod)); 
    if (t.toPeriod) keyPeriods.add(Number(t.toPeriod) + 1);
  });
  adjustments.forEach(a => { 
    if (a.fromPeriod) keyPeriods.add(Number(a.fromPeriod));
    if (a.toPeriod) keyPeriods.add(Number(a.toPeriod) + 1);
  });

  for (let p = 1; p <= N; p++) {
    const tier = getTier(p);
    const margin = tier?.rateMargin ? Number(tier.rateMargin) : Number(rateMargin);
    const isGracePeriod = tier?.isGracePeriod ?? false;
    const adj = getAdjustment(p);
    const R = Number(baseRate) + margin + adj;
    const r = R / 100 / 12;

    let interest = Math.round(currentOwed * r);
    let principal = 0;
    let payment = 0;

    if (isGracePeriod) {
      principal = 0;
      payment = interest;
    } else {
      const remainingN = N - p + 1;
      if (method === "equal_principal_interest") {
        if (r === 0) {
          payment = Math.round(currentOwed / remainingN);
        } else {
          const compound = Math.pow(1 + r, remainingN);
          payment = Math.round((currentOwed * r * compound) / (compound - 1));
        }
        principal = payment - interest;
      } else {
        principal = Math.round(currentOwed / remainingN);
        payment = principal + interest;
      }
    }

    if (keyPeriods.has(p)) {
      rows.push({ period: p, rate: R.toFixed(3), isGracePeriod, payment, principal, interest, balance: currentOwed - principal });
    }
    currentOwed -= principal;
    totalPaymentAmount += payment;
  }

  return (
    <div className="card" style={{ marginTop: 16, padding: "14px 16px", backgroundColor: "var(--surface-2)", borderLeft: "4px solid var(--primary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "bold" }}>📊 台灣標準房貸試算 (本息平均攤還法)</h4>
        <span style={{ fontSize: "13px", color: "var(--muted)" }}>
          預期總繳金額：<strong style={{ color: "var(--text)", fontSize: "14px" }}>{totalPaymentAmount.toLocaleString()}</strong>
        </span>
      </div>
      <div className="muted" style={{ fontSize: "11px", marginBottom: 12, lineHeight: 1.5 }}>
        核心公式：每月應付本息金額 ＝ 貸款本金 × {`{[(1 ＋ 月利率)^月數 × 月利率] ÷ [(1 ＋ 月利率)^月數 － 1]}`} <br />
        寬限期只繳利息：尚未清償本金 × 月利率 (年利率 ÷ 12)
      </div>
      <table style={{ width: "100%", fontSize: "13px", textAlign: "right", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "center", padding: "4px 8px" }}>期數</th>
            <th style={{ padding: "4px 8px" }}>適用利率</th>
            <th style={{ padding: "4px 8px" }}>應繳金額</th>
            <th style={{ padding: "4px 8px" }}>本金</th>
            <th style={{ padding: "4px 8px" }}>利息</th>
            <th style={{ padding: "4px 8px" }}>剩餘本金</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <td style={{ textAlign: "center", padding: "6px 8px" }}>第 {r.period} 期</td>
              <td style={{ padding: "6px 8px" }}>{r.rate}% {r.isGracePeriod && <span className="muted">(寬)</span>}</td>
              <td style={{ padding: "6px 8px", fontWeight: "bold", color: "var(--primary)" }}>{r.payment.toLocaleString()}</td>
              <td style={{ padding: "6px 8px" }}>{r.principal.toLocaleString()}</td>
              <td style={{ padding: "6px 8px" }}>{r.interest.toLocaleString()}</td>
              <td style={{ padding: "6px 8px" }}>{Math.max(0, r.balance).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTwd(amount: number): string {
  return "NT$ " + Math.round(amount).toLocaleString("en-US");
}

function calculateLoanPaymentAmountForPeriod({
  schedule,
  liabilityAccounts,
  baseRate,
  period,
}: {
  schedule: LoanRow & { liabilityAccountId?: string };
  liabilityAccounts: { id: string; balanceMinor: bigint; openingBalanceMinor: bigint }[];
  baseRate: string;
  period: number;
}): { amount: number; isGrace: boolean } {
  if (schedule.amortizationMethod === "flat") {
    return { amount: Number(schedule.amountMinor) / 100, isGrace: false };
  }

  const liabAcc = liabilityAccounts.find((a) => a.id === schedule.liabilityAccountId);
  const initialPrincipal = liabAcc
    ? Math.abs(Number(liabAcc.openingBalanceMinor) / 100)
    : Math.abs(Number(schedule.amountMinor) / 100);

  const totalN = schedule.totalPeriods || 480;
  if (!initialPrincipal || totalN <= 0) {
    return { amount: 0, isGrace: false };
  }

  // Grace period tier
  const graceTier = schedule.tiers.find((t) => (t as any).isGracePeriod);
  const graceUntilPeriod = graceTier ? graceTier.toPeriod : 0;
  const isGrace = period <= graceUntilPeriod;

  // Margin and adjustments
  const margin = Number(schedule.rateMargin) || 0;
  let adjTotal = 0;
  if (schedule.adjustments) {
    for (const a of schedule.adjustments) {
      if (period >= a.fromPeriod && (!a.toPeriod || period <= a.toPeriod)) {
        adjTotal += Number(a.adjustmentRate);
      }
    }
  }

  const R = Number(baseRate) + margin + adjTotal;
  const r = R / 100 / 12;

  if (isGrace) {
    return { amount: Math.round(initialPrincipal * r), isGrace: true };
  }

  const remainingN = totalN - graceUntilPeriod;
  if (schedule.amortizationMethod === "equal_principal_interest") {
    if (r === 0) return { amount: Math.round(initialPrincipal / remainingN), isGrace: false };
    const compound = Math.pow(1 + r, remainingN);
    const pmt = Math.round((initialPrincipal * r * compound) / (compound - 1));
    return { amount: pmt, isGrace: false };
  } else {
    const principalPortion = initialPrincipal / remainingN;
    const interestPortion = initialPrincipal * r;
    return { amount: Math.round(principalPortion + interestPortion), isGrace: false };
  }
}

interface MergedPhase {
  phaseIndex: number;
  fromOffset: number;
  toOffset: number;
  fromYearMonth: string;
  toYearMonth: string;
  fromPeriodDisplay: string;
  toPeriodDisplay: string;
  periodRangeLabel: string;
  monthCount: number;
  monthlyTotal: number;
  phaseTotal: number;
  allGrace: boolean;
  anyGrace: boolean;
  breakdown: {
    loanId: string;
    loanName: string;
    amount: number;
    isGrace: boolean;
    startPeriod: number;
    endPeriod: number;
  }[];
  statusNote: string;
}

function LoanOverviewSummary({
  schedules,
  liabilityAccounts,
  baseRate,
}: {
  schedules: (LoanRow & { liabilityAccountId?: string })[] | undefined;
  liabilityAccounts: { id: string; balanceMinor: bigint; openingBalanceMinor: bigint; excludeFromNetWorth: boolean }[];
  baseRate: string;
}) {
  const [viewMode, setViewMode] = usePersistentTab<"phases" | "months12">(
    "tab:loan-view",
    VALID_LOAN_VIEWS,
    "phases",
    "loanView"
  );

  const activeLoans = useMemo(() => {
    return (schedules || []).filter((s) => s.active);
  }, [schedules]);

  // Earliest nextRunDate or fallback to current month
  const refNextDateStr = useMemo(() => {
    for (const s of activeLoans) {
      if (s.nextRunDate) return s.nextRunDate;
    }
    return new Date().toISOString().slice(0, 10);
  }, [activeLoans]);

  // Current month payment info
  const currentPayments = useMemo(() => {
    return activeLoans.map((s) => {
      const curPeriod = (s.completedPeriods || 0) + 1;
      const res = calculateLoanPaymentAmountForPeriod({
        schedule: s,
        liabilityAccounts,
        baseRate,
        period: curPeriod,
      });
      return {
        loan: s,
        period: curPeriod,
        amount: res.amount,
        isGrace: res.isGrace,
      };
    });
  }, [activeLoans, liabilityAccounts, baseRate]);

  const currentMonthlyTotal = useMemo(() => {
    return currentPayments.reduce((sum, p) => sum + p.amount, 0);
  }, [currentPayments]);

  const isCurrentAllGrace = useMemo(() => {
    return currentPayments.length > 0 && currentPayments.every((p) => p.isGrace);
  }, [currentPayments]);

  // Grace periods remaining
  const graceRemainingInfo = useMemo(() => {
    let maxGraceLeft = 0;
    let graceEndPeriod = 0;
    let anyInGrace = false;

    for (const s of activeLoans) {
      const graceTier = s.tiers.find((t) => (t as any).isGracePeriod);
      const graceUntil = graceTier ? graceTier.toPeriod : 0;
      const completed = s.completedPeriods || 0;
      if (completed < graceUntil) {
        anyInGrace = true;
        const left = graceUntil - completed;
        if (left > maxGraceLeft) {
          maxGraceLeft = left;
          graceEndPeriod = graceUntil;
        }
      }
    }

    return {
      hasGrace: anyInGrace,
      monthsLeft: maxGraceLeft,
      graceEndPeriod,
    };
  }, [activeLoans]);

  // Total Initial Principal and Total Current Balance
  const { totalInitialPrincipal } = useMemo(() => {
    let initSum = 0;
    for (const s of activeLoans) {
      const liab = liabilityAccounts.find((a) => a.id === s.liabilityAccountId);
      if (liab) {
        initSum += Math.abs(Number(liab.openingBalanceMinor) / 100);
      } else {
        const val = Math.abs(Number(s.amountMinor) / 100);
        initSum += val;
      }
    }
    return { totalInitialPrincipal: initSum };
  }, [activeLoans, liabilityAccounts]);

  // Monthly projections across remaining lifespan
  const maxRemainingMonths = useMemo(() => {
    const remList = activeLoans.map((s) => Math.max(0, (s.totalPeriods || 480) - (s.completedPeriods || 0)));
    return Math.min(Math.max(...remList, 0), 600);
  }, [activeLoans]);

  const monthlyProjections = useMemo(() => {
    if (maxRemainingMonths === 0) return [];
    const baseD = new Date(refNextDateStr);
    const baseYear = isNaN(baseD.getTime()) ? new Date().getFullYear() : baseD.getFullYear();
    const baseMonth = isNaN(baseD.getTime()) ? new Date().getMonth() : baseD.getMonth();

    const list = [];
    for (let offset = 0; offset < maxRemainingMonths; offset++) {
      const d = new Date(baseYear, baseMonth + offset, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const yearMonth = `${y}/${m}`;

      let totalAmount = 0;
      const loanPayments = [];

      for (const s of activeLoans) {
        const curP = (s.completedPeriods || 0) + 1 + offset;
        const maxP = s.totalPeriods || 480;
        if (curP <= maxP) {
          const res = calculateLoanPaymentAmountForPeriod({
            schedule: s,
            liabilityAccounts,
            baseRate,
            period: curP,
          });
          totalAmount += res.amount;
          loanPayments.push({
            loanId: s.id,
            loanName: s.name,
            period: curP,
            amount: res.amount,
            isGrace: res.isGrace,
          });
        } else {
          loanPayments.push({
            loanId: s.id,
            loanName: s.name,
            period: curP,
            amount: 0,
            isGrace: false,
          });
        }
      }

      const allGrace = loanPayments.length > 0 && loanPayments.every((lp) => lp.amount > 0 && lp.isGrace);
      const anyGrace = loanPayments.some((lp) => lp.isGrace);

      list.push({
        offset,
        yearMonth,
        totalAmount,
        allGrace,
        anyGrace,
        loanPayments,
      });
    }

    return list;
  }, [activeLoans, maxRemainingMonths, refNextDateStr, liabilityAccounts, baseRate]);

  // Group consecutive identical months into MergedPhases
  const mergedPhases = useMemo<MergedPhase[]>(() => {
    if (monthlyProjections.length === 0) return [];

    type MonthlyProjItem = (typeof monthlyProjections)[number];

    const isSamePhase = (a: MonthlyProjItem, b: MonthlyProjItem) => {
      if (a.totalAmount !== b.totalAmount) return false;
      if (a.allGrace !== b.allGrace) return false;
      if (a.loanPayments.length !== b.loanPayments.length) return false;
      for (let i = 0; i < a.loanPayments.length; i++) {
        const ap = a.loanPayments[i];
        const bp = b.loanPayments[i];
        if (!ap || !bp) return false;
        if (ap.amount !== bp.amount) return false;
        if (ap.isGrace !== bp.isGrace) return false;
      }
      return true;
    };

    const buildPhaseItem = (
      index: number,
      group: MonthlyProjItem[],
      prev?: MergedPhase,
      isLast = false
    ): MergedPhase => {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      const monthCount = group.length;
      const monthlyTotal = first.totalAmount;
      const phaseTotal = monthlyTotal * monthCount;
      const allGrace = first.allGrace;
      const anyGrace = first.anyGrace;

      // Period labels
      const pStarts = first.loanPayments.map((lp) => lp.period);
      const pEnds = last.loanPayments.map((lp) => lp.period);
      const minStart = Math.min(...pStarts);
      const maxStart = Math.max(...pStarts);
      const minEnd = Math.min(...pEnds);
      const maxEnd = Math.max(...pEnds);

      let periodRangeLabel = "";
      if (minStart === maxStart && minEnd === maxEnd) {
        periodRangeLabel = minStart === minEnd ? `第 ${minStart} 期` : `第 ${minStart} ~ ${minEnd} 期`;
      } else {
        periodRangeLabel = `第 ${minStart}~${minEnd} 期`;
      }

      const breakdown = first.loanPayments.map((lp, idx) => ({
        loanId: lp.loanId,
        loanName: lp.loanName,
        amount: lp.amount,
        isGrace: lp.isGrace,
        startPeriod: lp.period,
        endPeriod: last.loanPayments[idx]?.period ?? lp.period,
      }));

      // Status Note
      let statusNote = "";
      if (allGrace) {
        const hasSubsidy = activeLoans.some((l) =>
          (l.adjustments || []).some(
            (a) =>
              Number(a.adjustmentRate) < 0 &&
              minStart >= a.fromPeriod &&
              (!a.toPeriod || minStart <= a.toPeriod)
          )
        );
        statusNote = hasSubsidy
          ? "寬限期純繳息（享新青安利息補貼）"
          : "寬限期純繳息（僅付利息不還本）";
      } else if (prev?.allGrace && !allGrace) {
        statusNote = "寬限期屆滿，開始本息平均攤還";
      } else {
        const adjDetails: string[] = [];
        for (const b of breakdown) {
          const l = activeLoans.find((x) => x.id === b.loanId);
          if (l && l.adjustments) {
            const matched = l.adjustments.find(
              (a) => b.startPeriod >= a.fromPeriod && (!a.toPeriod || b.startPeriod <= a.toPeriod)
            );
            if (matched) {
              const rate = Number(matched.adjustmentRate);
              const yards = (rate / 0.25).toFixed(2).replace(/\.?0+$/, "");
              adjDetails.push(`${l.name.replace("房貸－", "")}補貼 ${rate > 0 ? "+" : ""}${rate}% (${yards}碼)`);
            }
          }
        }
        if (adjDetails.length > 0) {
          statusNote = `青安利息補貼調整階段 (${adjDetails.join("、")})`;
        } else if (isLast) {
          statusNote = "基準利率長期穩定攤還至結清";
        } else {
          statusNote = "本息平均攤還階段";
        }
      }

      return {
        phaseIndex: index,
        fromOffset: first.offset,
        toOffset: last.offset,
        fromYearMonth: first.yearMonth,
        toYearMonth: last.yearMonth,
        fromPeriodDisplay: `第 ${minStart} 期`,
        toPeriodDisplay: `第 ${minEnd} 期`,
        periodRangeLabel,
        monthCount,
        monthlyTotal,
        phaseTotal,
        allGrace,
        anyGrace,
        breakdown,
        statusNote,
      };
    };

    const phases: MergedPhase[] = [];
    let currentGroup: MonthlyProjItem[] = [];

    for (let i = 0; i < monthlyProjections.length; i++) {
      const item = monthlyProjections[i];
      if (!item) continue;
      if (currentGroup.length === 0) {
        currentGroup.push(item);
      } else {
        const firstInGroup = currentGroup[0]!;
        if (isSamePhase(firstInGroup, item)) {
          currentGroup.push(item);
        } else {
          phases.push(buildPhaseItem(phases.length + 1, currentGroup, phases[phases.length - 1], false));
          currentGroup = [item];
        }
      }
    }

    if (currentGroup.length > 0) {
      phases.push(buildPhaseItem(phases.length + 1, currentGroup, phases[phases.length - 1], true));
    }

    return phases;
  }, [monthlyProjections, activeLoans]);

  // Grand totals across all remaining phases
  const totalRemainingRepayment = useMemo(() => {
    return mergedPhases.reduce((sum, p) => sum + p.phaseTotal, 0);
  }, [mergedPhases]);

  // Next 12 months list
  const next12Months = useMemo(() => {
    return monthlyProjections.slice(0, 12);
  }, [monthlyProjections]);

  const next12Total = useMemo(() => {
    return next12Months.reduce((sum, m) => sum + m.totalAmount, 0);
  }, [next12Months]);

  if (activeLoans.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: "20px",
        background: "var(--card-bg, #1a1f2c)",
        border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
        borderRadius: "12px",
        padding: "18px 20px",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          paddingBottom: "14px",
          marginBottom: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "18px" }}>📊</span>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em" }}>
              房貸月付總額與各階段還款概況
            </h3>
            <span
              className="badge"
              style={{
                fontSize: "11px",
                background: "rgba(77, 171, 247, 0.12)",
                color: "var(--primary, #4dabf7)",
                border: "1px solid rgba(77, 171, 247, 0.25)",
              }}
            >
              合併 {activeLoans.length} 筆貸款扣款
            </span>
          </div>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "12px" }}>
            自動彙整各筆貸款的寬限期、利率加減碼與本息攤還，連續相同月付額自動合併為階段簡表
          </p>
        </div>

        {/* View Switcher Toggle */}
        <div
          style={{
            display: "inline-flex",
            background: "rgba(0, 0, 0, 0.25)",
            borderRadius: "8px",
            padding: "3px",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          }}
        >
          <button
            type="button"
            className="btn ghost sm"
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              borderRadius: "6px",
              background: viewMode === "phases" ? "var(--surface, rgba(255, 255, 255, 0.1))" : "transparent",
              color: viewMode === "phases" ? "var(--foreground, #fff)" : "var(--muted)",
              fontWeight: viewMode === "phases" ? 600 : 400,
              boxShadow: viewMode === "phases" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
            onClick={() => setViewMode("phases")}
          >
            📌 階段合併簡表 ({mergedPhases.length} 階段)
          </button>
          <button
            type="button"
            className="btn ghost sm"
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              borderRadius: "6px",
              background: viewMode === "months12" ? "var(--surface, rgba(255, 255, 255, 0.1))" : "transparent",
              color: viewMode === "months12" ? "var(--foreground, #fff)" : "var(--muted)",
              fontWeight: viewMode === "months12" ? 600 : 400,
              boxShadow: viewMode === "months12" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
            onClick={() => setViewMode("months12")}
          >
            📅 未來 12 個月明細 (1 ~ 12 期)
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        {/* Card 1: Current Monthly Total */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ fontSize: "12px", color: "var(--muted)" }}>💳 當前每月還款總額</span>
            {isCurrentAllGrace ? (
              <span
                className="badge"
                style={{
                  fontSize: "10px",
                  background: "rgba(81, 207, 102, 0.15)",
                  color: "var(--income, #51cf66)",
                  border: "none",
                }}
              >
                寬限期純繳息
              </span>
            ) : (
              <span
                className="badge"
                style={{
                  fontSize: "10px",
                  background: "rgba(77, 171, 247, 0.15)",
                  color: "var(--primary, #4dabf7)",
                  border: "none",
                }}
              >
                本息平均攤還
              </span>
            )}
          </div>
          <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--expense, #ff6b6b)" }}>
            {formatTwd(currentMonthlyTotal)}
            <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--muted)", marginLeft: "4px" }}>/ 月</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
            {currentPayments.map((cp) => `${cp.loan.name.replace("房貸－", "")}: $${cp.amount.toLocaleString()}`).join(" + ")}
          </div>
        </div>

        {/* Card 2: Next Run Date & Payment */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>📅 下次預計扣款</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground, #fff)" }}>
            {formatTwd(currentMonthlyTotal)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
            扣款日：<strong style={{ color: "var(--foreground)" }}>{refNextDateStr}</strong>
            {currentPayments[0] ? ` (第 ${currentPayments[0].period} 期)` : ""}
          </div>
        </div>

        {/* Card 3: Grace Period Countdown */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>🛡️ 寬限期剩餘時間</div>
          {graceRemainingInfo.hasGrace ? (
            <>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--income, #51cf66)" }}>
                {graceRemainingInfo.monthsLeft} 個月
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
                至第 {graceRemainingInfo.graceEndPeriod} 期屆滿 · 屆滿後月繳約 {mergedPhases[1] ? formatTwd(mergedPhases[1].monthlyTotal) : "調整"}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--muted)" }}>無寬限期 / 已屆滿</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>持續以本息均攤穩定攤還中</div>
            </>
          )}
        </div>

        {/* Card 4: Total Remaining Repayment */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>🏦 全期預估剩餘總還款</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--primary, #4dabf7)" }}>
            {formatTwd(totalRemainingRepayment)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "4px" }}>
            總本金 {formatTwd(totalInitialPrincipal)} · 剩餘 {maxRemainingMonths} 期 (約 {(maxRemainingMonths / 12).toFixed(1)} 年)
          </div>
        </div>
      </div>

      {/* Mode A: Merged Phases Table */}
      {viewMode === "phases" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 10px", width: "16%" }}>期數區間</th>
                <th style={{ padding: "8px 10px", width: "18%" }}>涵蓋時間 / 月數</th>
                <th style={{ padding: "8px 10px", width: "24%" }}>各貸款分項預估</th>
                <th style={{ padding: "8px 10px", width: "14%", textAlign: "right" }}>每月合計應繳</th>
                <th style={{ padding: "8px 10px", width: "14%", textAlign: "right" }}>該階段累計應繳</th>
                <th style={{ padding: "8px 10px", width: "14%" }}>階段說明</th>
              </tr>
            </thead>
            <tbody>
              {mergedPhases.map((phase) => {
                const isCurrent = phase.phaseIndex === 1;
                return (
                  <tr
                    key={phase.phaseIndex}
                    style={{
                      borderBottom: "1px solid var(--border, rgba(255,255,255,0.05))",
                      background: isCurrent ? "rgba(77, 171, 247, 0.04)" : "transparent",
                    }}
                  >
                    {/* Period Range */}
                    <td style={{ padding: "10px 10px", fontWeight: 600 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{phase.periodRangeLabel}</span>
                        {isCurrent && (
                          <span
                            className="badge"
                            style={{
                              fontSize: "10px",
                              background: "rgba(77, 171, 247, 0.2)",
                              color: "var(--primary, #4dabf7)",
                              border: "none",
                              padding: "1px 6px",
                            }}
                          >
                            當前進行
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 400, marginTop: "2px" }}>
                        階段 {phase.phaseIndex}
                      </div>
                    </td>

                    {/* Date Range & Duration */}
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ fontWeight: 500 }}>
                        {phase.fromYearMonth} ~ {phase.toYearMonth}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                        共 <strong style={{ color: "var(--foreground)" }}>{phase.monthCount}</strong> 個月
                        {phase.monthCount >= 12 && ` (${(phase.monthCount / 12).toFixed(1)} 年)`}
                      </div>
                    </td>

                    {/* Breakdown */}
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {phase.breakdown.map((b) => (
                          <div
                            key={b.loanId}
                            style={{
                              fontSize: "12px",
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span style={{ color: "var(--muted)" }}>{b.loanName.replace("房貸－", "")}:</span>
                            <span style={{ fontWeight: 500 }}>
                              {formatTwd(b.amount)}
                              {b.isGrace && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--income, #51cf66)",
                                    marginLeft: "4px",
                                  }}
                                >
                                  (息)
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Monthly Total */}
                    <td
                      style={{
                        padding: "10px 10px",
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: "14px",
                        color: phase.allGrace ? "var(--income, #51cf66)" : "var(--expense, #ff6b6b)",
                      }}
                    >
                      {formatTwd(phase.monthlyTotal)}
                      <div style={{ fontSize: "10px", fontWeight: 400, color: "var(--muted)" }}>
                        {phase.allGrace ? "純繳息" : "本息攤還"}
                      </div>
                    </td>

                    {/* Phase Total */}
                    <td
                      style={{
                        padding: "10px 10px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: "var(--foreground, #fff)",
                      }}
                    >
                      {formatTwd(phase.phaseTotal)}
                    </td>

                    {/* Status Note */}
                    <td style={{ padding: "10px 10px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          lineHeight: "1.4",
                          color: phase.allGrace
                            ? "var(--income, #51cf66)"
                            : phase.phaseIndex === 2
                            ? "var(--expense, #ff6b6b)"
                            : "var(--muted)",
                          display: "inline-block",
                        }}
                      >
                        {phase.statusNote}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: "2px solid var(--border)",
                  background: "rgba(255, 255, 255, 0.02)",
                  fontWeight: 600,
                }}
              >
                <td style={{ padding: "10px 10px" }}>全期剩餘合計</td>
                <td style={{ padding: "10px 10px", color: "var(--muted)" }}>
                  剩餘 {maxRemainingMonths} 期 (約 {(maxRemainingMonths / 12).toFixed(1)} 年)
                </td>
                <td style={{ padding: "10px 10px", color: "var(--muted)" }}>
                  原始本金總額 {formatTwd(totalInitialPrincipal)}
                </td>
                <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--muted)" }}>—</td>
                <td
                  style={{
                    padding: "10px 10px",
                    textAlign: "right",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--primary, #4dabf7)",
                  }}
                >
                  {formatTwd(totalRemainingRepayment)}
                </td>
                <td style={{ padding: "10px 10px", fontSize: "11px", color: "var(--muted)" }}>
                  預估總利息約 {formatTwd(Math.max(0, totalRemainingRepayment - totalInitialPrincipal))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Mode B: Next 12 Months Breakdown */}
      {viewMode === "months12" && (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 10px", width: "15%" }}>扣款月份</th>
                <th style={{ padding: "8px 10px", width: "15%" }}>期數別</th>
                <th style={{ padding: "8px 10px", width: "35%" }}>各筆貸款扣款明細</th>
                <th style={{ padding: "8px 10px", width: "15%", textAlign: "right" }}>當月應繳總額</th>
                <th style={{ padding: "8px 10px", width: "10%", textAlign: "right" }}>累計支出</th>
                <th style={{ padding: "8px 10px", width: "10%" }}>還款狀態</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let runningTotal = 0;
                return next12Months.map((m, idx) => {
                  runningTotal += m.totalAmount;
                  const isFirst = idx === 0;
                  return (
                    <tr
                      key={m.offset}
                      style={{
                        borderBottom: "1px solid var(--border, rgba(255,255,255,0.05))",
                        background: isFirst ? "rgba(77, 171, 247, 0.04)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "9px 10px", fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{m.yearMonth}</span>
                          {isFirst && (
                            <span
                              className="badge"
                              style={{
                                fontSize: "10px",
                                background: "rgba(77, 171, 247, 0.2)",
                                color: "var(--primary, #4dabf7)",
                                border: "none",
                              }}
                            >
                              本月
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "9px 10px", color: "var(--muted)" }}>
                        {m.loanPayments.map((lp) => `第 ${lp.period} 期`).filter((v, i, a) => a.indexOf(v) === i).join(" / ")}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          {m.loanPayments.map((lp) => (
                            <span key={lp.loanId} style={{ fontSize: "12px" }}>
                              <span style={{ color: "var(--muted)" }}>{lp.loanName.replace("房貸－", "")}: </span>
                              <strong>{formatTwd(lp.amount)}</strong>
                              {lp.isGrace && (
                                <span style={{ color: "var(--income, #51cf66)", fontSize: "11px", marginLeft: "3px" }}>
                                  (純繳息)
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "9px 10px",
                          textAlign: "right",
                          fontWeight: 700,
                          color: m.allGrace ? "var(--income, #51cf66)" : "var(--expense, #ff6b6b)",
                        }}
                      >
                        {formatTwd(m.totalAmount)}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: "var(--foreground, #fff)" }}>
                        {formatTwd(runningTotal)}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        {m.allGrace ? (
                          <span
                            className="badge"
                            style={{
                              fontSize: "10px",
                              background: "rgba(81, 207, 102, 0.15)",
                              color: "var(--income, #51cf66)",
                              border: "none",
                            }}
                          >
                            寬限期繳息
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              fontSize: "10px",
                              background: "rgba(77, 171, 247, 0.15)",
                              color: "var(--primary, #4dabf7)",
                              border: "none",
                            }}
                          >
                            本息攤還
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: "2px solid var(--border)",
                  background: "rgba(255, 255, 255, 0.02)",
                  fontWeight: 600,
                }}
              >
                <td colSpan={3} style={{ padding: "10px 10px" }}>
                  未來 12 個月預估總還款支出
                </td>
                <td
                  style={{
                    padding: "10px 10px",
                    textAlign: "right",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--expense, #ff6b6b)",
                  }}
                >
                  {formatTwd(next12Total)}
                </td>
                <td colSpan={2} style={{ padding: "10px 10px", fontSize: "11px", color: "var(--muted)" }}>
                  平均每月 {formatTwd(next12Total / (next12Months.length || 1))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function LoanTab() {
  const utils = trpc.useUtils();
  const schedules = trpc.loanPayments.list.useQuery();
  const accounts = trpc.accounts.listWithBalances.useQuery();

  const baseRateQuery = trpc.loanPayments.getBaseRate.useQuery();
  const updateBaseRate = trpc.loanPayments.updateBaseRate.useMutation({
    onSuccess: () => {
      baseRateQuery.refetch();
      utils.loanPayments.list.invalidate();
      utils.forecast.projection.invalidate();
    },
  });
  const [localBaseRate, setLocalBaseRate] = useState("1.85");

  useEffect(() => {
    if (baseRateQuery.data !== undefined) {
      setLocalBaseRate(baseRateQuery.data);
    }
  }, [baseRateQuery.data]);

  const [name, setName] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [firstRunDate, setFirstRunDate] = useState("");
  const [completedPeriods, setCompletedPeriods] = useState("");
  const [totalPeriods, setTotalPeriods] = useState("");
  const [amortizationMethod, setAmortizationMethod] = useState("flat");
  const [rateMargin, setRateMargin] = useState("0");
  const [gracePeriods, setGracePeriods] = useState("");
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [prepayTarget, setPrepayTarget] = useState<LoanRow | null>(null);
  const [taxReportOpen, setTaxReportOpen] = useState(false);

  const assetAccounts = (accounts.data ?? []).filter((a) => !isLiabilityType(a.type)) as { id: string; name: string; currency: string }[];
  const liabilityAccounts = (accounts.data ?? []).filter((a) => isLiabilityType(a.type)) as { id: string; balanceMinor: bigint; openingBalanceMinor: bigint; excludeFromNetWorth: boolean }[];

  const invalidate = () =>
    Promise.all([
      utils.loanPayments.list.invalidate(),
      utils.accounts.list.invalidate(),
      utils.accounts.listWithBalances.invalidate(),
      utils.netWorth.summary.invalidate(),
      utils.forecast.projection.invalidate(),
    ]);

  const create = trpc.loanPayments.createWithLiability.useMutation();

  const update = trpc.loanPayments.update.useMutation({
    onSuccess: async () => {
      await invalidate();
      setEditingId(null);
    },
  });
  const setActive = trpc.loanPayments.setActive.useMutation({ onSuccess: invalidate });
  const remove = trpc.loanPayments.delete.useMutation({ onSuccess: invalidate });

  useEffect(() => {
    if (!sourceAccountId && assetAccounts.length) setSourceAccountId(assetAccounts[0]!.id);
  }, [assetAccounts, sourceAccountId]);

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceAccountId) return;
    setError(null);
    setSaving(true);
    try {
      await create.mutateAsync({
        name,
        owedBalance: openingBalance || "0",
        sourceAccountId,
        amount: amortizationMethod === "flat" ? amount : "0",
        dayOfMonth: Number(dayOfMonth),
        firstRunDate: firstRunDate || undefined,
        completedPeriods: completedPeriods ? Number(completedPeriods) : undefined,
        totalPeriods: totalPeriods ? Number(totalPeriods) : undefined,
        excludeFromNetWorth: true,
        tiers: toTierPayload(toGracePeriodTier(gracePeriods), amortizationMethod),
        amortizationMethod,
        rateMargin,
        adjustments: toAdjustmentPayload(adjustments),
        note: note || undefined,
      });
      await invalidate();
      setName("");
      setOpeningBalance("");
      setAmount("");
      setNote("");
      setFirstRunDate("");
      setCompletedPeriods("");
      setTotalPeriods("");
      setRateMargin("0");
      setGracePeriods("");
      setAdjustments([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        房貸、信貸等每月還款：填目前欠款與每月扣款，系統會自動建立負債並逐月減少欠款。
      </p>

      <div className="card" style={{ marginBottom: "16px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "16px", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h4 style={{ margin: 0, fontSize: "14px" }}>🏦 全域機動利率設定（指標利率）</h4>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              style={{ width: "80px", textAlign: "right", margin: 0 }}
              value={localBaseRate}
              onChange={(e) => setLocalBaseRate(e.target.value)}
            />
            <span>%</span>
            <button
              type="button"
              className="btn ghost sm"
              style={{ padding: "4px 10px" }}
              onClick={() => updateBaseRate.mutate({ rate: localBaseRate })}
              disabled={updateBaseRate.isPending}
            >
              {updateBaseRate.isPending ? "儲存中…" : "儲存設定"}
            </button>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setTaxReportOpen(true)}
          >
            🧾 房貸利息所得稅報表
          </button>
        </div>
      </div>

      {/* Loan Overview Summary */}
      <LoanOverviewSummary
        schedules={schedules.data}
        liabilityAccounts={liabilityAccounts}
        baseRate={localBaseRate}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📋</span> 房貸 / 貸款計畫列表
          {schedules.data && schedules.data.length > 0 && (
            <span className="badge muted-badge" style={{ fontSize: "11px" }}>
              {schedules.data.length} 筆
            </span>
          )}
        </h3>
        <button
          type="button"
          className="btn ghost sm"
          style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "收合新增表單 ▲" : "+ 新增房貸 / 貸款計畫 ▼"}
        </button>
      </div>

      {(showCreateForm || !schedules.data || schedules.data.length === 0) && (
        <form className="card" onSubmit={submitCreate} style={{ marginBottom: 16 }}>
          <div className="grid cols-3">
            <label>
              名稱
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="房貸" />
            </label>
            <label>
              貸款總金額 (初始餘額)
              <AmountInput required value={openingBalance} onChange={setOpeningBalance} placeholder="8000000" />
            </label>
            <label>
              扣款銀行帳戶
              <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
                {assetAccounts.length === 0 && <option value="">請先新增銀行帳戶</option>}
                {assetAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <label>
              還款方式
              <select value={amortizationMethod} onChange={(e) => setAmortizationMethod(e.target.value)}>
                <option value="flat">每月固定金額</option>
                <option value="equal_principal_interest">本息平均攤還 (機動利率)</option>
                <option value="equal_principal">本金平均攤還 (機動利率)</option>
              </select>
            </label>
            {amortizationMethod === "flat" ? (
              <label>
                每月還款金額 (預設)
                <AmountInput required value={amount} onChange={setAmount} />
              </label>
            ) : (
              <label>
                加碼利率 (額外利率 %)
                <input required value={rateMargin} onChange={(e) => setRateMargin(e.target.value)} placeholder="如 +0.35 或 -0.1" />
              </label>
            )}
            <label>
              每月扣款日
              <input inputMode="numeric" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
            <label>
              第一期扣款日 (選填，自動推算)
              <input type="date" value={firstRunDate} onChange={(e) => setFirstRunDate(e.target.value)} />
            </label>
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <label>
              已繳期數 (選填)
              <input inputMode="numeric" value={completedPeriods} onChange={(e) => setCompletedPeriods(e.target.value)} placeholder="0" />
            </label>
            <label>
              總期數 (選填，機動利率建議填)
              <input inputMode="numeric" value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} placeholder="420" />
            </label>
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            {amortizationMethod !== "flat" && (
              <label>
                寬限期 (期數)
                <input inputMode="numeric" value={gracePeriods} onChange={(e) => setGracePeriods(e.target.value)} placeholder="如 36" />
                <span className="field-label" style={{ marginTop: 4 }}>寬限期內僅繳息不還本</span>
              </label>
            )}
            <label>
              備註
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
            </label>
          </div>
          
          {amortizationMethod !== "flat" && (
            <AdjustmentEditor adjustments={adjustments} onChange={setAdjustments} />
          )}
          {amortizationMethod !== "flat" && openingBalance && (
            <AmortizationPreview
              owed={openingBalance}
              totalPeriods={totalPeriods}
              baseRate={localBaseRate}
              rateMargin={rateMargin}
              tiers={toGracePeriodTier(gracePeriods)}
              adjustments={adjustments}
              method={amortizationMethod}
            />
          )}
          <div className="row-inline" style={{ marginTop: 12 }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "建立中…" : "新增房貸/貸款"}
            </button>
            {error && <span className="error-text">{error}</span>}
          </div>
        </form>
      )}

      {schedules.data && schedules.data.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {schedules.data.map((s) => (
            <LoanItem
              key={s.id}
              s={s}
              assetAccounts={assetAccounts}
              liabilityAccounts={liabilityAccounts}
              baseRate={localBaseRate}
              editing={editingId === s.id}
              saving={update.isPending && editingId === s.id}
              onEdit={() => setEditingId(s.id)}
              onClose={() => setEditingId(null)}
              onSave={(patch) => update.mutate({ id: s.id, ...patch })}
              onToggleActive={() => setActive.mutate({ id: s.id, active: !s.active })}
              onPrepay={() => setPrepayTarget(s)}
              onDelete={async () => {
                const ok = await niceConfirm("刪除房貸/貸款", `確定要刪除「${s.name}」計畫嗎？`, "danger");
                if (ok) remove.mutate({ id: s.id });
              }}
            />
          ))}
        </div>
      )}

      {taxReportOpen && (
        <LoanTaxReportModal onClose={() => setTaxReportOpen(false)} />
      )}

      {prepayTarget && (
        <LoanPrepaymentModal
          scheduleId={prepayTarget.id}
          scheduleName={prepayTarget.name}
          currency={prepayTarget.currency}
          currentOwedMinor={
            (() => {
              const liab = liabilityAccounts.find((a) => a.id === prepayTarget.liabilityAccountId);
              if (!liab) return 0n;
              return liab.balanceMinor < 0n ? -liab.balanceMinor : liab.balanceMinor;
            })()
          }
          sourceAccountId={prepayTarget.sourceAccountId}
          assetAccounts={assetAccounts}
          onClose={() => setPrepayTarget(null)}
          onSuccess={() => invalidate()}
        />
      )}
    </div>
  );
}

function LoanItem({
  s,
  assetAccounts,
  liabilityAccounts,
  baseRate,
  editing,
  saving,
  onEdit,
  onClose,
  onSave,
  onToggleActive,
  onDelete,
  onPrepay,
}: {
  s: LoanRow & { liabilityAccountId?: string };
  assetAccounts: { id: string; name: string; currency: string }[];
  liabilityAccounts: { id: string; balanceMinor: bigint; openingBalanceMinor: bigint; excludeFromNetWorth: boolean }[];
  baseRate: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    amount: string;
    dayOfMonth: number;
    completedPeriods?: number;
    totalPeriods: number | null;
    excludeFromNetWorth?: boolean;
    tiers: ReturnType<typeof toTierPayload>;
    adjustments: { fromPeriod: number; toPeriod?: number; adjustmentRate: string }[];
    note?: string | null;
    amortizationMethod: string;
    rateMargin: string;
    owedBalance?: string;
    sourceAccountId?: string;
  }) => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onPrepay: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [amount, setAmount] = useState(String(Number(s.amountMinor) / 100));
  const [openingBalance, setOpeningBalance] = useState(
    s.liabilityAccountId
      ? String(Number((liabilityAccounts.find(a => a.id === s.liabilityAccountId)?.openingBalanceMinor ?? 0n) * -1n) / 100)
      : ""
  );
  const [dayOfMonth, setDayOfMonth] = useState(String(s.dayOfMonth));
  const [completedPeriods, setCompletedPeriods] = useState(String(s.completedPeriods));
  const [totalPeriods, setTotalPeriods] = useState(s.totalPeriods != null ? String(s.totalPeriods) : "");
  const [gracePeriods, setGracePeriods] = useState("");
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [note, setNote] = useState(s.note ?? "");
  const [amortizationMethod, setAmortizationMethod] = useState(s.amortizationMethod ?? "flat");
  const [rateMargin, setRateMargin] = useState(s.rateMargin ?? "0");
  const [sourceAccountId, setSourceAccountId] = useState(s.sourceAccountId);

  useEffect(() => {
    if (editing) {
      setName(s.name);
      setAmount(String(Number(s.amountMinor) / 100));
      setDayOfMonth(String(s.dayOfMonth));
      setCompletedPeriods(String(s.completedPeriods));
      setTotalPeriods(s.totalPeriods != null ? String(s.totalPeriods) : "");
      setNote(s.note ?? "");
      setAmortizationMethod(s.amortizationMethod ?? "flat");
      setRateMargin(s.rateMargin ?? "0");
      setSourceAccountId(s.sourceAccountId);
      const graceTier = s.tiers.find(t => (t as any).isGracePeriod);
      setGracePeriods(graceTier ? String(graceTier.toPeriod) : "");
      setAdjustments(
        (s.adjustments || []).map((a) => ({
          fromPeriod: String(a.fromPeriod),
          toPeriod: a.toPeriod ? String(a.toPeriod) : "",
          adjustmentYards: String(Number(a.adjustmentRate) / 0.25),
        }))
      );
    }
  }, [editing, s]);

  const curPeriod = (s.completedPeriods || 0) + 1;
  const nextPeriod = curPeriod + 1;

  const curPayment = useMemo(() => {
    return calculateLoanPaymentAmountForPeriod({
      schedule: s,
      liabilityAccounts,
      baseRate,
      period: curPeriod,
    });
  }, [s, liabilityAccounts, baseRate, curPeriod]);

  const nextPayment = useMemo(() => {
    return calculateLoanPaymentAmountForPeriod({
      schedule: s,
      liabilityAccounts,
      baseRate,
      period: nextPeriod,
    });
  }, [s, liabilityAccounts, baseRate, nextPeriod]);

  const curAdj = useMemo(() => {
    let adjTotal = 0;
    if (s.adjustments) {
      for (const a of s.adjustments) {
        if (curPeriod >= a.fromPeriod && (!a.toPeriod || curPeriod <= a.toPeriod)) {
          adjTotal += Number(a.adjustmentRate);
        }
      }
    }
    return adjTotal;
  }, [s.adjustments, curPeriod]);

  const effectiveRate = Number(baseRate) + Number(s.rateMargin || 0) + curAdj;

  const progress =
    s.totalPeriods != null ? ` · 已繳 ${s.completedPeriods}/${s.totalPeriods} 期` : "";

  let methodLabel = "固定金額";
  if (s.amortizationMethod === "equal_principal_interest" || s.amortizationMethod === "equal_principal") {
    const typeName = s.amortizationMethod === "equal_principal_interest" ? "本息攤還" : "本金攤還";
    const rateDisplay = `${effectiveRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
    if (curAdj !== 0) {
      const yards = (curAdj / 0.25).toFixed(1).replace(/\.0$/, "");
      const adjDesc = curAdj < 0 ? `青安補貼 ${curAdj}% (${yards}碼)` : `調整 +${curAdj}% (${yards}碼)`;
      methodLabel = `${typeName} · 利率 ${rateDisplay} (${adjDesc})`;
    } else {
      const margin = Number(s.rateMargin || 0);
      const marginDesc = margin !== 0 ? `加碼 ${margin > 0 ? "+" : ""}${margin}%` : "依指標利率";
      methodLabel = `${typeName} · 利率 ${rateDisplay} (${marginDesc})`;
    }
  }

  const secondaryLabel = `每月 · 下次 ${s.nextRunDate?.slice(0, 7)}${progress} · ${methodLabel}`;

  return (
    <EditableRow
      editing={editing}
      onEdit={onEdit}
      onClose={onClose}
      onDelete={onDelete}
      active={s.active}
      onToggleActive={onToggleActive}
      primary={
        <>
          {s.name}
          {!s.active && <span className="badge muted-badge">已暫停</span>}
        </>
      }
      secondary={secondaryLabel}
      right={
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
          <div style={{ fontSize: "13px", fontWeight: "bold", color: "var(--expense)" }}>
            本期 (第 {curPeriod} 期): {curPayment.amount > 0 ? fmt(BigInt(Math.round(curPayment.amount * 100)), s.currency) : "計算中"}
            {curPayment.isGrace && (
              <span className="badge" style={{ marginLeft: 6, fontSize: "10px", background: "rgba(81,207,102,0.15)", color: "var(--income)", border: "none" }}>
                寬限期
              </span>
            )}
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <span>下期 (第 {nextPeriod} 期): {nextPayment.amount > 0 ? fmt(BigInt(Math.round(nextPayment.amount * 100)), s.currency) : "計算中"}</span>
            {curPayment.isGrace && !nextPayment.isGrace && (
              <span className="badge" style={{ fontSize: "10px", background: "rgba(255,107,107,0.15)", color: "var(--expense)", border: "none" }}>
                ⚠️ 寬限期結束切換本息
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ fontSize: "11px", padding: "2px 8px", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}
            onClick={(e) => {
              e.stopPropagation();
              onPrepay();
            }}
          >
            💰 提前還本試算
          </button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            amount: amortizationMethod === "flat" ? amount : "0",
            owedBalance: openingBalance || undefined,
            dayOfMonth: Number(dayOfMonth),
            completedPeriods: completedPeriods ? Number(completedPeriods) : 0,
            totalPeriods: totalPeriods ? Number(totalPeriods) : null,
            excludeFromNetWorth: true,
            tiers: toTierPayload(toGracePeriodTier(gracePeriods), amortizationMethod),
            adjustments: toAdjustmentPayload(adjustments),
            amortizationMethod,
            rateMargin,
            note: note || null,
            sourceAccountId,
          });
        }}
      >
        <div className="grid cols-3">
          <label>
            名稱
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            還款方式
            <select value={amortizationMethod} onChange={(e) => setAmortizationMethod(e.target.value)}>
              <option value="flat">每月固定金額</option>
              <option value="equal_principal_interest">本息平均攤還 (機動利率)</option>
              <option value="equal_principal">本金平均攤還 (機動利率)</option>
            </select>
          </label>
          {amortizationMethod === "flat" ? (
            <label>
              每月還款金額 (預設)
              <AmountInput required value={amount} onChange={setAmount} />
            </label>
          ) : (
            <label>
              加碼利率 (額外利率 %)
              <input required value={rateMargin} onChange={(e) => setRateMargin(e.target.value)} placeholder="如 +0.35 或 -0.1" />
            </label>
          )}
        </div>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          <label>
            貸款總金額 (初始餘額)
            <AmountInput required value={openingBalance} onChange={setOpeningBalance} />
          </label>
          <label>
            扣款銀行帳戶
            <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </label>
          <label>
            每月扣款日
            <input inputMode="numeric" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </label>
        </div>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          <label>
            已繳期數
            <input inputMode="numeric" value={completedPeriods} onChange={(e) => setCompletedPeriods(e.target.value)} />
          </label>
          <label>
            總期數
            <input inputMode="numeric" value={totalPeriods} onChange={(e) => setTotalPeriods(e.target.value)} />
          </label>
        </div>
        <div className="grid cols-3" style={{ marginTop: 12 }}>
          {amortizationMethod !== "flat" && (
            <label>
              寬限期 (期數)
              <input inputMode="numeric" placeholder="例如: 36" value={gracePeriods} onChange={(e) => setGracePeriods(e.target.value)} />
              <span className="field-label" style={{ marginTop: 4 }}>寬限期內僅繳息不還本</span>
            </label>
          )}
          <label>
            備註
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {amortizationMethod !== "flat" && (
          <AdjustmentEditor adjustments={adjustments} onChange={setAdjustments} />
        )}
        {editing && amortizationMethod !== "flat" && (
          <AmortizationPreview
            owed={openingBalance || String(Number((liabilityAccounts.find(a => a.id === s.liabilityAccountId)?.openingBalanceMinor ?? 0n) * -1n) / 100)}
            totalPeriods={totalPeriods}
            baseRate={baseRate}
            rateMargin={rateMargin}
            tiers={toGracePeriodTier(gracePeriods)}
            adjustments={adjustments}
            method={amortizationMethod}
          />
        )}
        <div className="row-inline" style={{ marginTop: 12 }}>
          <button className="btn sm" type="submit" disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </form>
    </EditableRow>
  );
}
