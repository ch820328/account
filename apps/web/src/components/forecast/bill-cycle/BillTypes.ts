export interface BillItem {
  id: string;
  amountMinor: string;
  paidDate: string;
  startDate: string | null;
  endDate: string | null;
  totalDays: number | null;
  note: string | null;
  accountId: string | null;
  accountName: string | null;
  prorations: Array<{
    month: number;
    days: number;
    amountMinor: string;
  }>;
  attachments: Array<{
    id: string;
    filename: string;
    sizeBytes: number;
  }>;
}

export interface BillSummary {
  annualBudgetMinor: string;
  totalSpentMinor: string;
  coveredMonthsCount: number;
  progressPercent: number;
  proratedBudgetMinor: string;
  varianceMinor: string;
  isOverBudget: boolean;
  billsCount: number;
}
