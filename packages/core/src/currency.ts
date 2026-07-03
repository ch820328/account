/** Reporting base currency. Multi-currency data is supported everywhere; this is
 * only the default currency that aggregate reports (net worth, totals) convert into.
 */
export function getBaseCurrency(): string {
  return (process.env.APP_BASE_CURRENCY ?? "TWD").toUpperCase();
}

export const SUPPORTED_CURRENCIES = [
  "TWD",
  "USD",
  "EUR",
  "JPY",
  "CNY",
  "HKD",
  "GBP",
  "AUD",
  "SGD",
  "KRW",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
