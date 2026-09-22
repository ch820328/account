export interface MonthAllocation {
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

export interface BudgetItem {
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
  months: MonthAllocation[];
}

export interface ForecastAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  currentBalanceMinor?: bigint;
}

export interface ForecastMonthAccountBreakdown {
  accountId: string;
  accountName: string;
  startingBalanceMinor: bigint;
  inflowMinor: bigint;
  fixedOutflowMinor: bigint;
  budgetOutflowMinor: bigint;
  netCashflowMinor: bigint;
  projectedBalanceMinor: bigint;
}

export interface ForecastMonthRow {
  month: number;
  monthKey: string;
  isCurrent: boolean;
  inflowMinor: bigint;
  fixedOutflowMinor: bigint;
  budgetOutflowMinor: bigint;
  netCashflowMinor: bigint;
  projectedBalanceMinor: bigint;
  accountsBreakdown: ForecastMonthAccountBreakdown[];
}
