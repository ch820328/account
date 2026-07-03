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
