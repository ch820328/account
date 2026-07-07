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

/** Human label for a transaction's origin. `null` for plain manual entries. */
export const TRANSACTION_SOURCE_LABELS: Record<string, string | null> = {
  manual: null,
  recurring: "定期",
  payroll: "薪資",
  installment: "分期",
  loan: "貸款",
  rsu: "RSU",
};

export function transactionSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  return TRANSACTION_SOURCE_LABELS[source] ?? null;
}

/** Auto-generated transactions come from a schedule, not manual bookkeeping. */
export function isAutoTransaction(source: string | null | undefined): boolean {
  return !!source && source !== "manual";
}

export type LoanLedgerKind = "lend" | "collect" | "borrow" | "repay";

export const LOAN_LEDGER_KIND_OPTIONS: { value: LoanLedgerKind; label: string }[] = [
  { value: "lend", label: "我借出（對方欠我）" },
  { value: "collect", label: "對方還我" },
  { value: "borrow", label: "我跟對方借（我欠對方）" },
  { value: "repay", label: "我還對方" },
];

export const LOAN_LEDGER_KIND_LABELS: Record<LoanLedgerKind, string> = {
  lend: "借出",
  collect: "收款",
  borrow: "借入",
  repay: "還款",
};

/** lend/repay increase what they owe me; collect/borrow decrease it. */
export function isPositiveLedgerKind(kind: LoanLedgerKind): boolean {
  return kind === "lend" || kind === "repay";
}
