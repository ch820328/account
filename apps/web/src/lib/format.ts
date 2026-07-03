import { currencyExponent, money, toDecimalString } from "@acc/money";

/** Format bigint minor units with $ prefix and thousands separators. */
export function fmt(amountMinor: bigint, currency: string): string {
  const negative = amountMinor < 0n;
  const absMinor = negative ? -amountMinor : amountMinor;
  const exp = currencyExponent(currency);
  const absVal = Math.abs(Number(toDecimalString(money(absMinor, currency))));
  const num = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: exp,
  }).format(absVal);
  return `${negative ? "−" : ""}$${num}`;
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
