import type { BudgetItem } from "../types";

export interface MasterBudgetMatrixProps {
  targetYear: number;
  currentMonthIdx: number;
  budgetItems: BudgetItem[];
  onStartEdit?: (item: BudgetItem) => void;
  onStartAdd?: () => void;
  onSettled?: () => void;
  onDelete?: (id: string) => Promise<void>;
}

export function getAccountIcon(type?: string | null, name?: string | null) {
  if (type === "credit") return "💳";
  if (type === "cash") return "💵";
  if (type === "wallet") return "📱";
  if (type === "bank") return "🏦";
  if (type === "mortgage" || type === "loan") return "🏠";
  const n = (name || "").toLowerCase();
  if (n.includes("信用卡") || n.includes("卡") || n.includes("credit")) return "💳";
  if (n.includes("現金") || n.includes("cash")) return "💵";
  if (n.includes("銀行") || n.includes("戶") || n.includes("bank")) return "🏦";
  return "💳";
}
