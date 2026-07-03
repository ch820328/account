import { LIABILITY_ACCOUNT_TYPES } from "@acc/db/schema";

export type AccountSide = "asset" | "liability";

export const ACCOUNT_SIDES: { value: AccountSide; label: string }[] = [
  { value: "asset", label: "資產（我有的錢）" },
  { value: "liability", label: "負債（我欠的錢）" },
];

/** Map simplified UI choice to stored account type. */
export function defaultTypeForSide(side: AccountSide): "bank" | "loan" {
  return side === "liability" ? "loan" : "bank";
}

export function accountSideLabel(isLiability: boolean): string {
  return isLiability ? "負債" : "資產";
}

export function isLiabilityType(type: string): boolean {
  return (LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type);
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

export const FREQUENCY_OPTIONS = ["daily", "weekly", "monthly", "yearly"] as const;

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: "每日",
  weekly: "每週",
  monthly: "每月",
  yearly: "每年",
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
