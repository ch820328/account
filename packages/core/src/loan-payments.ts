import {
  type Database,
  loanPaymentSchedules,
  loanPaymentTiers,
  loanRateAdjustments,
  transactions,
  forecastSettings,
  categories,
  accounts,
} from "@acc/db";
import { and, eq, inArray, lte, or } from "drizzle-orm";
import { advanceRecurringDate, initialNextRunDate, parseIsoDate } from "./recurring";
import { todayIsoDate } from "./sync";

export interface GenerateLoanPaymentsResult {
  processed: number;
  created: number;
}

export interface LoanTier {
  fromPeriod: number;
  toPeriod: number;
  amountMinor: bigint;
  rateMargin: string | null;
  isGracePeriod: boolean;
}

export interface LoanAdjustment {
  fromPeriod: number;
  toPeriod: number | null;
  adjustmentRate: string;
}

/**
 * Pick the payment amount for a given 1-based period from the tier ranges,
 * falling back to the schedule's default amount when nothing matches.
 */
export function amountForPeriod(
  period: number,
  tiers: LoanTier[],
  fallbackMinor: bigint,
): bigint {
  for (const tier of tiers) {
    if (period >= tier.fromPeriod && period <= tier.toPeriod) return tier.amountMinor;
  }
  return fallbackMinor;
}

export function rateMarginForPeriod(
  period: number,
  tiers: LoanTier[],
  fallbackMargin: string,
): string {
  for (const tier of tiers) {
    if (period >= tier.fromPeriod && period <= tier.toPeriod && tier.rateMargin != null) {
      return tier.rateMargin;
    }
  }
  return fallbackMargin;
}

export function activeTierForPeriod(
  period: number,
  tiers: LoanTier[],
): LoanTier | undefined {
  for (const tier of tiers) {
    if (period >= tier.fromPeriod && period <= tier.toPeriod) {
      return tier;
    }
  }
  return undefined;
}

export function totalAdjustmentForPeriod(
  period: number,
  adjustments: LoanAdjustment[],
): number {
  let total = 0;
  for (const adj of adjustments) {
    if (period >= adj.fromPeriod && (adj.toPeriod == null || period <= adj.toPeriod)) {
      total += Number(adj.adjustmentRate);
    }
  }
  return total;
}

export function calculateNextLoanPaymentAmount(
  schedule: {
    amortizationMethod: string;
    rateMargin: string;
    completedPeriods: number;
    totalPeriods: number | null;
    amountMinor: bigint;
  },
  tiers: LoanTier[],
  adjustments: LoanAdjustment[],
  currentOwed: bigint,
  baseRate: number,
  period: number,
): bigint {
  if (
    schedule.amortizationMethod === "equal_principal_interest" ||
    schedule.amortizationMethod === "equal_principal"
  ) {
    const currentTier = activeTierForPeriod(period, tiers);
    const currentRateMargin = (currentTier?.rateMargin && Number(currentTier.rateMargin) !== 0)
      ? currentTier.rateMargin
      : schedule.rateMargin;
    const isGracePeriod = currentTier?.isGracePeriod ?? false;

    const adjustmentsTotal = totalAdjustmentForPeriod(period, adjustments);
    const R = baseRate + Number(currentRateMargin) + adjustmentsTotal;
    const r = R / 100 / 12;
    const N = schedule.totalPeriods ? schedule.totalPeriods - (period - 1) : 1;

    const P = Math.abs(Number(currentOwed));

    if (r > 0 && N > 0) {
      const interestMinor = BigInt(Math.round(P * r));
      if (isGracePeriod) {
        return interestMinor; // Pay only interest
      } else if (schedule.amortizationMethod === "equal_principal_interest") {
        const compound = Math.pow(1 + r, N);
        const pmt = (P * r * compound) / (compound - 1);
        return BigInt(Math.round(pmt));
      } else {
        const principalPortion = P / N;
        return BigInt(Math.round(principalPortion)) + interestMinor;
      }
    } else {
      return N > 0 ? BigInt(Math.round(P / N)) : 0n;
    }
  } else {
    return amountForPeriod(period, tiers, schedule.amountMinor);
  }
}

export interface PrepaymentSimulationResult {
  currentPrincipalMinor: bigint;
  prepaymentMinor: bigint;
  newPrincipalMinor: bigint;
  annualRatePct: number;
  originalRemainingPeriods: number;
  originalPaymentMinor: bigint;
  originalTotalInterestMinor: bigint;
  isFullPayoff: boolean;

  // Option A: 減額（期數不變，月繳下降）
  optionA: {
    newPaymentMinor: bigint;
    monthlySavingsMinor: bigint;
    newTotalInterestMinor: bigint;
    totalInterestSavedMinor: bigint;
  };

  // Option B: 縮期（月繳不變，期數縮短）
  optionB: {
    paymentMinor: bigint;
    newRemainingPeriods: number;
    periodsShortened: number;
    yearsMonthsShortened: { years: number; months: number };
    newTotalInterestMinor: bigint;
    totalInterestSavedMinor: bigint;
  };
}

export function simulateLoanPrepayment(params: {
  currentPrincipalMinor: bigint;
  prepaymentMinor: bigint;
  annualRatePct: number;
  remainingPeriods: number;
}): PrepaymentSimulationResult {
  const P_minor = params.currentPrincipalMinor > 0n ? params.currentPrincipalMinor : 0n;
  const L_minor = params.prepaymentMinor > 0n ? params.prepaymentMinor : 0n;
  const N = Math.max(1, params.remainingPeriods);
  const R = Math.max(0, params.annualRatePct);
  const r = R / 100 / 12;

  const P = Number(P_minor);
  const L = Math.min(Number(L_minor), P);
  const P_new = Math.max(0, P - L);
  const isFullPayoff = P_new === 0;

  // 1. Baseline simulation (without prepayment)
  let pmt0 = 0;
  if (r > 0) {
    const compound = Math.pow(1 + r, N);
    pmt0 = Math.round((P * r * compound) / (compound - 1));
  } else {
    pmt0 = Math.round(P / N);
  }

  let totalInterest0 = 0;
  let bal0 = P;
  for (let i = 1; i <= N; i++) {
    const interest = Math.round(bal0 * r);
    totalInterest0 += interest;
    let principal = pmt0 - interest;
    if (i === N || principal >= bal0) {
      principal = bal0;
    }
    bal0 -= principal;
    if (bal0 <= 0) break;
  }

  if (isFullPayoff) {
    const yearsShortened = Math.floor(N / 12);
    const monthsShortened = N % 12;
    return {
      currentPrincipalMinor: P_minor,
      prepaymentMinor: P_minor,
      newPrincipalMinor: 0n,
      annualRatePct: R,
      originalRemainingPeriods: N,
      originalPaymentMinor: BigInt(pmt0),
      originalTotalInterestMinor: BigInt(totalInterest0),
      isFullPayoff: true,
      optionA: {
        newPaymentMinor: 0n,
        monthlySavingsMinor: BigInt(pmt0),
        newTotalInterestMinor: 0n,
        totalInterestSavedMinor: BigInt(totalInterest0),
      },
      optionB: {
        paymentMinor: 0n,
        newRemainingPeriods: 0,
        periodsShortened: N,
        yearsMonthsShortened: { years: yearsShortened, months: monthsShortened },
        newTotalInterestMinor: 0n,
        totalInterestSavedMinor: BigInt(totalInterest0),
      },
    };
  }

  // 2. Option A: Payment reduction (期數不變，月繳下降)
  let pmtA = 0;
  if (r > 0) {
    const compound = Math.pow(1 + r, N);
    pmtA = Math.round((P_new * r * compound) / (compound - 1));
  } else {
    pmtA = Math.round(P_new / N);
  }

  let totalInterestA = 0;
  let balA = P_new;
  for (let i = 1; i <= N; i++) {
    const interest = Math.round(balA * r);
    totalInterestA += interest;
    let principal = pmtA - interest;
    if (i === N || principal >= balA) {
      principal = balA;
    }
    balA -= principal;
    if (balA <= 0) break;
  }

  // 3. Option B: Term reduction (月繳不變，期數縮短)
  let totalInterestB = 0;
  let balB = P_new;
  let newPeriodsB = 0;

  while (balB > 0 && newPeriodsB < N) {
    newPeriodsB++;
    const interest = Math.round(balB * r);
    totalInterestB += interest;
    let principal = pmt0 - interest;
    if (principal <= 0) {
      // payment doesn't cover interest
      principal = 1;
    }
    if (principal >= balB) {
      balB = 0;
      break;
    }
    balB -= principal;
  }

  const periodsShortened = Math.max(0, N - newPeriodsB);
  const yearsShortened = Math.floor(periodsShortened / 12);
  const monthsShortened = periodsShortened % 12;

  return {
    currentPrincipalMinor: P_minor,
    prepaymentMinor: BigInt(Math.round(L)),
    newPrincipalMinor: BigInt(Math.round(P_new)),
    annualRatePct: R,
    originalRemainingPeriods: N,
    originalPaymentMinor: BigInt(pmt0),
    originalTotalInterestMinor: BigInt(totalInterest0),
    isFullPayoff: false,
    optionA: {
      newPaymentMinor: BigInt(pmtA),
      monthlySavingsMinor: BigInt(Math.max(0, pmt0 - pmtA)),
      newTotalInterestMinor: BigInt(totalInterestA),
      totalInterestSavedMinor: BigInt(Math.max(0, totalInterest0 - totalInterestA)),
    },
    optionB: {
      paymentMinor: BigInt(pmt0),
      newRemainingPeriods: newPeriodsB,
      periodsShortened,
      yearsMonthsShortened: { years: yearsShortened, months: monthsShortened },
      newTotalInterestMinor: BigInt(totalInterestB),
      totalInterestSavedMinor: BigInt(Math.max(0, totalInterest0 - totalInterestB)),
    },
  };
}

export async function generateDueLoanPayments(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GenerateLoanPaymentsResult> {
  const due = await db
    .select()
    .from(loanPaymentSchedules)
    .where(
      and(eq(loanPaymentSchedules.active, true), lte(loanPaymentSchedules.nextRunDate, asOf)),
    );

  let created = 0;
  if (due.length === 0) return { processed: 0, created: 0 };

  const allTiers = await db
    .select()
    .from(loanPaymentTiers)
    .where(inArray(loanPaymentTiers.scheduleId, due.map((s) => s.id)));

  const tiersBySchedule = new Map<string, LoanTier[]>();
  for (const t of allTiers) {
    const list = tiersBySchedule.get(t.scheduleId) ?? [];
    list.push({ 
      fromPeriod: t.fromPeriod, 
      toPeriod: t.toPeriod, 
      amountMinor: t.amountMinor, 
      rateMargin: t.rateMargin,
      isGracePeriod: t.isGracePeriod 
    });
    tiersBySchedule.set(t.scheduleId, list);
  }

  const allAdjustments = await db
    .select()
    .from(loanRateAdjustments)
    .where(inArray(loanRateAdjustments.scheduleId, due.map((s) => s.id)));

  const adjustmentsBySchedule = new Map<string, LoanAdjustment[]>();
  for (const a of allAdjustments) {
    const list = adjustmentsBySchedule.get(a.scheduleId) ?? [];
    list.push({ fromPeriod: a.fromPeriod, toPeriod: a.toPeriod, adjustmentRate: a.adjustmentRate });
    adjustmentsBySchedule.set(a.scheduleId, list);
  }

  for (const schedule of due) {
    const tiers = tiersBySchedule.get(schedule.id) ?? [];
    const adjustments = adjustmentsBySchedule.get(schedule.id) ?? [];
    const monthly = {
      frequency: "monthly" as const,
      interval: 1,
      dayOfMonth: schedule.dayOfMonth,
      weekday: null,
    };

    // Get user's base rate
    const [settings] = await db
      .select({ loanBaseRate: forecastSettings.loanBaseRate })
      .from(forecastSettings)
      .where(eq(forecastSettings.userId, schedule.userId))
      .limit(1);
    const baseRate = settings ? Number(settings.loanBaseRate) : 1.85;

    // Get current balance of the liability account (outstanding principal)
    const [acct] = await db
      .select({ openingBalanceMinor: accounts.openingBalanceMinor })
      .from(accounts)
      .where(eq(accounts.id, schedule.liabilityAccountId))
      .limit(1);
    let currentOwed = acct ? acct.openingBalanceMinor : 0n;

    const txs = await db
      .select({
        accountId: transactions.accountId,
        transferAccountId: transactions.transferAccountId,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        transferAmountMinor: transactions.transferAmountMinor,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, schedule.userId),
          or(
            eq(transactions.accountId, schedule.liabilityAccountId),
            eq(transactions.transferAccountId, schedule.liabilityAccountId)
          )
        )
      );

    for (const tx of txs) {
      if (tx.accountId === schedule.liabilityAccountId) {
        if (tx.type === "transfer") {
          currentOwed = currentOwed + tx.amountMinor;
        } else if (tx.type === "expense") {
          currentOwed = currentOwed + tx.amountMinor;
        } else if (tx.type === "income") {
          currentOwed = currentOwed - tx.amountMinor;
        }
      }
      if (tx.transferAccountId === schedule.liabilityAccountId) {
        const amt = tx.transferAmountMinor !== null && tx.transferAmountMinor !== undefined
          ? tx.transferAmountMinor
          : tx.amountMinor;
        currentOwed = currentOwed - amt;
      }
    }

    await db.transaction(async (tx) => {
      let runDate = schedule.nextRunDate;
      let completed = schedule.completedPeriods;

      while (runDate <= asOf) {
        if (schedule.totalPeriods != null && completed >= schedule.totalPeriods) break;

        const period = completed + 1;
        let amountMinor = 0n;
        let interestMinor = 0n;

        if (
          schedule.amortizationMethod === "equal_principal_interest" ||
          schedule.amortizationMethod === "equal_principal"
        ) {
          const currentTier = activeTierForPeriod(period, tiers);
          const currentRateMargin = (currentTier?.rateMargin && Number(currentTier.rateMargin) !== 0)
            ? currentTier.rateMargin
            : schedule.rateMargin;
          const isGracePeriod = currentTier?.isGracePeriod ?? false;
          
          const adjustmentsTotal = totalAdjustmentForPeriod(period, adjustments);
          const R = baseRate + Number(currentRateMargin) + adjustmentsTotal;
          const r = R / 100 / 12;
          const N = schedule.totalPeriods ? (schedule.totalPeriods - completed) : 1;

          if (r > 0 && N > 0) {
            interestMinor = BigInt(Math.round(Number(currentOwed) * r));
            if (isGracePeriod) {
              amountMinor = interestMinor; // Pay only interest
            } else if (schedule.amortizationMethod === "equal_principal_interest") {
              const compound = Math.pow(1 + r, N);
              const pmt = (Number(currentOwed) * r * compound) / (compound - 1);
              amountMinor = BigInt(Math.round(pmt));
            } else {
              const principalPortion = Number(currentOwed) / N;
              amountMinor = BigInt(Math.round(principalPortion)) + interestMinor;
            }
          } else {
            amountMinor = N > 0 ? (currentOwed / BigInt(N)) : 0n;
            interestMinor = 0n;
          }
        } else {
          amountMinor = amountForPeriod(period, tiers, schedule.amountMinor);
        }

        // Insert payment transfer transaction
        await tx.insert(transactions).values({
          userId: schedule.userId,
          accountId: schedule.sourceAccountId,
          transferAccountId: schedule.liabilityAccountId,
          type: "transfer",
          amountMinor,
          currency: schedule.currency,
          occurredAt: parseIsoDate(runDate),
          note: schedule.note ?? schedule.name,
          source: "loan",
        });

        // Insert interest expense transaction if any
        if (interestMinor > 0n) {
          let categoryId: string | null = null;
          const [cat] = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.userId, schedule.userId),
                eq(categories.name, "利息支出")
              )
            )
            .limit(1);

          if (cat) {
            categoryId = cat.id;
          } else {
            const [newCat] = await tx
              .insert(categories)
              .values({
                userId: schedule.userId,
                name: "利息支出",
                kind: "expense",
              })
              .returning({ id: categories.id });
            categoryId = newCat?.id ?? null;
          }

          await tx.insert(transactions).values({
            userId: schedule.userId,
            accountId: schedule.liabilityAccountId,
            categoryId,
            type: "expense",
            amountMinor: interestMinor,
            currency: schedule.currency,
            occurredAt: parseIsoDate(runDate),
            note: `${schedule.name} - 利息`,
            source: "loan",
          });
        }
        
        currentOwed = currentOwed - (amountMinor - interestMinor);
        if (currentOwed < 0n) currentOwed = 0n;

        created += 1;
        completed += 1;

        runDate = advanceRecurringDate(runDate, monthly);
      }

      const done = schedule.totalPeriods != null && completed >= schedule.totalPeriods;
      await tx
        .update(loanPaymentSchedules)
        .set({
          nextRunDate: runDate,
          completedPeriods: completed,
          active: done ? false : schedule.active,
        })
        .where(eq(loanPaymentSchedules.id, schedule.id));
    });
  }

  return { processed: due.length, created };
}

export function firstLoanPaymentDate(dayOfMonth: number, anchor?: string): string {
  return initialNextRunDate(anchor ?? todayIsoDate(), {
    frequency: "monthly",
    interval: 1,
    dayOfMonth,
    weekday: null,
  });
}

export interface LoanPeriodPaymentResult {
  amountMinor: bigint;
  isGrace: boolean;
  period: number;
}

/**
 * Calculates the monthly payment amount and grace period status for a specific
 * calendar month (1–12) and target year, based on the loan schedule's nextRunDate,
 * completedPeriods, tiers, adjustments, and base interest rate.
 */
export function calculateLoanPeriodPayment(params: {
  amortizationMethod: string;
  amountMinor: bigint;
  rateMargin: string;
  totalPeriods: number | null;
  completedPeriods: number;
  nextRunDate: string;
  tiers: LoanTier[];
  adjustments: LoanAdjustment[];
  initialPrincipalMinor: bigint;
  baseRate: number | string;
  targetYear: number;
  month: number; // 1-12
}): LoanPeriodPaymentResult {
  const {
    amortizationMethod,
    amountMinor,
    rateMargin,
    totalPeriods,
    completedPeriods,
    nextRunDate,
    tiers,
    adjustments,
    initialPrincipalMinor,
    baseRate,
    targetYear,
    month,
  } = params;

  // Determine base date from nextRunDate
  const dParts = (nextRunDate || "2026-01-01").split("-");
  const baseYear = parseInt(dParts[0] || "2026", 10);
  const baseMonth = parseInt(dParts[1] || "1", 10);

  // nextRunDate corresponds to period: completedPeriods + 1
  const nextPeriod = (completedPeriods || 0) + 1;
  const monthDiff = (targetYear - baseYear) * 12 + (month - baseMonth);
  const period = nextPeriod + monthDiff;

  const totalN = totalPeriods || 480;
  if (period < 1 || period > totalN) {
    return { amountMinor: 0n, isGrace: false, period };
  }

  if (amortizationMethod === "flat") {
    return {
      amountMinor: amountForPeriod(period, tiers, amountMinor),
      isGrace: false,
      period,
    };
  }

  const initialPrincipal = Math.abs(Number(initialPrincipalMinor) / 100);
  if (initialPrincipal <= 0 || totalN <= 0) {
    return { amountMinor: 0n, isGrace: false, period };
  }

  const graceTier = tiers.find((t) => t.isGracePeriod);
  const graceUntilPeriod = graceTier ? graceTier.toPeriod : 0;
  const isGrace = period <= graceUntilPeriod;

  const margin = Number(rateMargin) || 0;
  const adjTotal = totalAdjustmentForPeriod(period, adjustments);
  const R = Number(baseRate) + margin + adjTotal;
  const r = R / 100 / 12;

  if (isGrace) {
    const monthlyInterest = Math.round(initialPrincipal * r);
    return {
      amountMinor: BigInt(monthlyInterest) * 100n,
      isGrace: true,
      period,
    };
  }

  const remainingN = totalN - graceUntilPeriod;
  if (remainingN <= 0) {
    return { amountMinor: 0n, isGrace: false, period };
  }

  if (amortizationMethod === "equal_principal_interest") {
    if (r === 0) {
      const pmt = Math.round(initialPrincipal / remainingN);
      return { amountMinor: BigInt(pmt) * 100n, isGrace: false, period };
    }
    const compound = Math.pow(1 + r, remainingN);
    const pmt = Math.round((initialPrincipal * r * compound) / (compound - 1));
    return { amountMinor: BigInt(pmt) * 100n, isGrace: false, period };
  } else {
    const principalPortion = initialPrincipal / remainingN;
    const interestPortion = initialPrincipal * r;
    const pmt = Math.round(principalPortion + interestPortion);
    return { amountMinor: BigInt(pmt) * 100n, isGrace: false, period };
  }
}
