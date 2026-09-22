/**
 * Annual budget dynamic rolling allocation and fixed month allocation module.
 */

export interface MonthlyAllocation {
  month: number;
  monthKey: string;
  isActual: boolean;
  actualMinor: bigint;
  allocatedMinor: bigint;
  effectiveMinor: bigint;
  isPaid?: boolean;
  hasUnpaidCredit?: boolean;
  txDateNote?: string | null;
  transactionId?: string | null;
}

export interface BudgetAllocationItem {
  id: string;
  year: number;
  name: string;
  icon: string | null;
  annualAmountMinor: bigint;
  allocationType: "rolling" | "fixed_months";
  targetMonths: string | null;
  targetMonthsList: number[];
  accountId: string | null;
  accountName: string | null;
  accountType?: string | null;
  accountCurrency?: string | null;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryId?: string | null;
  parentCategoryName?: string | null;
  matchPattern: string | null;
  note: string | null;
  sortOrder?: number;
  isAutoLoan?: boolean;
  spentAmountMinor: bigint;
  remainingAmountMinor: bigint;
  remainingMonthsCount: number;
  baselineMonthlyMinor: bigint;
  dynamicFutureMonthlyMinor: bigint;
  months: MonthlyAllocation[];
}

/**
 * Calculates allocations for an annual budget given:
 * - targetYear
 * - currentMonthIdx (1..12, or 13 if past year, or 0 if future year)
 * - annualAmountMinor
 * - allocationType ("rolling" | "fixed_months")
 * - targetMonthsStr (comma-separated months, e.g. "5" or "1,4,7,10")
 * - monthActuals Map (month -> actual spent amount minor)
 * - monthHasRecords Map (month -> whether an explicit transaction occurred)
 * - monthPaidStatus Map (month -> whether transactions in this month are paid / false if unpaid credit)
 * - monthTxDateNotes Map (month -> note about transaction dates, e.g. "8/28刷卡")
 * - monthTxIds Map (month -> primary transaction ID)
 */
export function calculateBudgetAllocations(params: {
  targetYear: number;
  currentMonthIdx: number;
  annualAmountMinor: bigint;
  allocationType: "rolling" | "fixed_months";
  targetMonthsStr: string | null;
  monthActuals: Map<number, bigint>;
  monthHasRecords: Map<number, boolean>;
  monthPaidStatus?: Map<number, boolean>;
  monthTxDateNotes?: Map<number, string | null>;
  monthTxIds?: Map<number, string | null>;
  monthAllocationsMap?: Map<number, bigint>;
}): {
  targetMonthsList: number[];
  spentAmountMinor: bigint;
  remainingAmountMinor: bigint;
  remainingMonthsCount: number;
  baselineMonthlyMinor: bigint;
  dynamicFutureMonthlyMinor: bigint;
  months: MonthlyAllocation[];
} {
  const {
    targetYear,
    currentMonthIdx,
    annualAmountMinor,
    allocationType,
    targetMonthsStr,
    monthActuals,
    monthHasRecords,
    monthPaidStatus,
    monthTxDateNotes,
    monthTxIds,
    monthAllocationsMap,
  } = params;

  const isFixedMonths = allocationType === "fixed_months";
  const targetMonthsList = (targetMonthsStr || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 12);

  // Calculate past actual spending and count future candidate months
  let actualSpentSoFar = 0n;
  const futureMonthsList: number[] = [];

  for (let m = 1; m <= 12; m++) {
    const hasRecord = monthHasRecords.get(m) ?? false;
    const actualVal = monthActuals.get(m) ?? 0n;

    if (m < currentMonthIdx) {
      actualSpentSoFar += actualVal;
    } else if (m === currentMonthIdx) {
      if (hasRecord) {
        actualSpentSoFar += actualVal;
      } else {
        futureMonthsList.push(m);
      }
    } else {
      futureMonthsList.push(m);
    }
  }

  const remainingBudget =
    annualAmountMinor > actualSpentSoFar
      ? annualAmountMinor - actualSpentSoFar
      : 0n;

  const months: MonthlyAllocation[] = [];

  if (isFixedMonths) {
    const targetPeriods = targetMonthsList.length > 0 ? targetMonthsList.length : 1;
    const fixedPerPeriod = annualAmountMinor / BigInt(targetPeriods);

    for (let m = 1; m <= 12; m++) {
      const monthKey = `${targetYear}-${String(m).padStart(2, "0")}`;
      const isTarget = targetMonthsList.includes(m);
      const actual = monthActuals.get(m) ?? 0n;
      const isPastOrRecorded =
        m < currentMonthIdx || (m === currentMonthIdx && (monthHasRecords.get(m) ?? false));
      const scheduledAllocation = monthAllocationsMap
        ? (monthAllocationsMap.get(m) ?? 0n)
        : (isTarget ? fixedPerPeriod : 0n);

      if (isPastOrRecorded) {
        const isPaid = monthPaidStatus?.get(m) ?? true;
        months.push({
          month: m,
          monthKey,
          isActual: true,
          actualMinor: actual,
          allocatedMinor: scheduledAllocation,
          effectiveMinor: actual,
          isPaid,
          hasUnpaidCredit: !isPaid,
          txDateNote: monthTxDateNotes?.get(m) ?? null,
          transactionId: monthTxIds?.get(m) ?? null,
        });
      } else if (isTarget || scheduledAllocation > 0n) {
        months.push({
          month: m,
          monthKey,
          isActual: false,
          actualMinor: 0n,
          allocatedMinor: scheduledAllocation,
          effectiveMinor: scheduledAllocation,
          isPaid: true,
          hasUnpaidCredit: false,
        });
      } else {
        months.push({
          month: m,
          monthKey,
          isActual: false,
          actualMinor: 0n,
          allocatedMinor: 0n,
          effectiveMinor: 0n,
          isPaid: true,
          hasUnpaidCredit: false,
        });
      }
    }

    const remainingTargetCount = targetMonthsList.filter((m) => m >= currentMonthIdx).length;

    return {
      targetMonthsList,
      spentAmountMinor: actualSpentSoFar,
      remainingAmountMinor: remainingBudget,
      remainingMonthsCount: remainingTargetCount,
      baselineMonthlyMinor: fixedPerPeriod,
      dynamicFutureMonthlyMinor: fixedPerPeriod,
      months,
    };
  } else {
    const remainingCount = futureMonthsList.length;
    const baselineMonthly = annualAmountMinor / 12n;

    for (let m = 1; m <= 12; m++) {
      const monthKey = `${targetYear}-${String(m).padStart(2, "0")}`;
      const isPastOrRecorded =
        m < currentMonthIdx || (m === currentMonthIdx && (monthHasRecords.get(m) ?? false));
      const actual = monthActuals.get(m) ?? 0n;

      if (isPastOrRecorded) {
        const isPaid = monthPaidStatus?.get(m) ?? true;
        months.push({
          month: m,
          monthKey,
          isActual: true,
          actualMinor: actual,
          allocatedMinor: baselineMonthly,
          effectiveMinor: actual,
          isPaid,
          hasUnpaidCredit: !isPaid,
          txDateNote: monthTxDateNotes?.get(m) ?? null,
          transactionId: monthTxIds?.get(m) ?? null,
        });
      } else {
        months.push({
          month: m,
          monthKey,
          isActual: false,
          actualMinor: 0n,
          allocatedMinor: baselineMonthly,
          effectiveMinor: baselineMonthly,
          isPaid: true,
          hasUnpaidCredit: false,
        });
      }
    }

    return {
      targetMonthsList,
      spentAmountMinor: actualSpentSoFar,
      remainingAmountMinor: remainingBudget,
      remainingMonthsCount: remainingCount,
      baselineMonthlyMinor: baselineMonthly,
      dynamicFutureMonthlyMinor: baselineMonthly,
      months,
    };
  }
}

/**
 * Prorate a transaction's amount across calendar months in targetYear based on daily overlap.
 * Uses ceiling rounding to whole integer dollars per month as requested.
 */
export function prorateTransactionByPeriod(
  txAmountMinor: bigint,
  startStr: string,
  endStr: string,
  targetYear: number
): Map<number, bigint> {
  const result = new Map<number, bigint>();
  const [sYear, sMonth, sDay] = startStr.split("-").map(Number);
  const [eYear, eMonth, eDay] = endStr.split("-").map(Number);
  if (!sYear || !sMonth || !sDay || !eYear || !eMonth || !eDay) return result;

  const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
  const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));
  if (endDate.getTime() < startDate.getTime()) return result;

  const ONE_DAY_MS = 86400 * 1000;
  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / ONE_DAY_MS) + 1;
  if (totalDays <= 0) return result;

  const monthDays = new Map<number, number>();

  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(Date.UTC(targetYear, m - 1, 1));
    const monthEnd = new Date(Date.UTC(targetYear, m, 0)); // last day of month m

    const overlapStart = Math.max(startDate.getTime(), monthStart.getTime());
    const overlapEnd = Math.min(endDate.getTime(), monthEnd.getTime());

    if (overlapEnd >= overlapStart) {
      const days = Math.round((overlapEnd - overlapStart) / ONE_DAY_MS) + 1;
      monthDays.set(m, days);
    }
  }

  const txDollars = Number(txAmountMinor) / 100;
  for (const [m, days] of monthDays.entries()) {
    const portionDollars = Math.ceil((txDollars * days) / totalDays);
    result.set(m, BigInt(portionDollars) * 100n);
  }

  return result;
}
