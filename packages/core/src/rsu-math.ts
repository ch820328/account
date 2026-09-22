/**
 * Split total quantity into `periods` monthly installments.
 * Each period uses ceiling on remaining/periods-left so shares are whole units
 * when total is integral, and the sum equals the original total.
 */
export function splitQuantityCeiling(total: string, periods: number): string[] {
  let remaining = Number(total);
  if (!Number.isFinite(remaining) || remaining < 0) {
    throw new Error(`Invalid quantity: ${total}`);
  }
  if (periods < 1) throw new Error("periods must be >= 1");

  const result: string[] = [];
  for (let i = 0; i < periods; i++) {
    const periodsLeft = periods - i;
    const q = Math.ceil(remaining / periodsLeft);
    result.push(String(q));
    remaining -= q;
  }
  return result;
}

/** Add months to YYYY-MM-DD (day clamped to month end). */
export function addMonthsIso(iso: string, months: number, dayOfMonth?: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d ?? 1);
  date.setMonth(date.getMonth() + months);
  if (dayOfMonth != null) {
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(dayOfMonth, last));
  }
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Calculate vest date for a specific period index, maintaining fixed day of month.
 * frequency: "monthly" (1 month apart) or "quarterly" (3 months apart).
 */
export function calculateVestDateIso(
  startDateIso: string,
  periodIdxZeroBased: number,
  frequency: "monthly" | "quarterly" = "monthly"
): string {
  const [yStr, mStr, dStr] = startDateIso.split("-");
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 1;
  const fixedDay = Number(dStr) || 1;

  const monthsToAdd = frequency === "quarterly" ? periodIdxZeroBased * 3 : periodIdxZeroBased * 1;
  const totalMonths = (m - 1) + monthsToAdd;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(fixedDay, daysInTargetMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/**
 * Calculate yearly RSU shares based on custom yearly percentage ratios (e.g. [38, 32, 20, 10]).
 * Uses Math.ceil on fractional shares and ensures total equals original quantity.
 */
export function calculateCustomRsuVesting(totalQuantity: number, yearlyPcts: number[]): number[] {
  let remaining = totalQuantity;
  const result: number[] = [];
  for (let i = 0; i < yearlyPcts.length; i++) {
    if (i === yearlyPcts.length - 1) {
      result.push(Math.max(0, remaining));
    } else {
      const pct = yearlyPcts[i] ?? 0;
      const shares = Math.ceil(totalQuantity * (pct / 100));
      const actualShares = Math.min(shares, remaining);
      result.push(actualShares);
      remaining -= actualShares;
    }
  }
  return result;
}

/**
 * Taiwan Individual Income Tax calculator.
 * Net Taxable Income = Gross Income - Exemptions & Deductions (approx $446,000 for single worker).
 */
export function calculateTaiwanIncomeTax(annualGrossIncome: number): number {
  const totalDeduction = 446000;
  const netTaxable = Math.max(0, annualGrossIncome - totalDeduction);

  let tax = 0;
  if (netTaxable <= 590000) {
    tax = netTaxable * 0.05;
  } else if (netTaxable <= 1330000) {
    tax = netTaxable * 0.12 - 41300;
  } else if (netTaxable <= 2660000) {
    tax = netTaxable * 0.20 - 147700;
  } else if (netTaxable <= 4980000) {
    tax = netTaxable * 0.30 - 413700;
  } else {
    tax = netTaxable * 0.40 - 911700;
  }
  return Math.round(tax);
}
