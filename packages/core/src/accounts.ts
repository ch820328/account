import { ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES } from "@acc/db";

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isLiabilityAccount(type: string): boolean {
  return (LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "現金",
  bank: "銀行帳戶",
  credit: "信用卡",
  broker: "證券戶",
  wallet: "電子錢包",
  loan: "貸款",
  mortgage: "房貸",
};
