import { currencyExponent, money, toDecimalString } from "@acc/money";

/** Format bigint minor units with $ prefix and thousands separators as rounded integers. */
export function fmt(amountMinor: bigint, currency: string): string {
  const negative = amountMinor < 0n;
  const absMinor = negative ? -amountMinor : amountMinor;
  const exp = currencyExponent(currency);
  const absVal = Math.abs(Number(toDecimalString(money(absMinor, currency))));
  const num = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(absVal));
  const isTwd = currency.toUpperCase() === "TWD";
  const sym = isTwd ? "$" : `${currency} $`;
  return `${negative ? "−" : ""}${sym} ${num}`;
}

/** Convert bigint minor units to a rounded major integer for charts. */
export function toMajor(amountMinor: bigint, currency: string): number {
  const exp = currencyExponent(currency);
  return Math.round(Number(amountMinor) / 10 ** exp);
}

export function fmtDate(d: Date | string): string {
  if (!d) return "";
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  return String(d).slice(0, 7);
}
