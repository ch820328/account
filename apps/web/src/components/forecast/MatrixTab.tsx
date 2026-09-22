"use client";

import type { BudgetItem } from "./types";
import { MasterBudgetMatrix } from "./MasterBudgetMatrix";

interface MatrixTabProps {
  targetYear: number;
  currentMonthIdx: number;
  budgetItems: BudgetItem[];
  onStartEdit?: (item: BudgetItem) => void;
  onStartAdd?: () => void;
}

export function MatrixTab({
  targetYear,
  currentMonthIdx,
  budgetItems,
  onStartEdit,
  onStartAdd,
}: MatrixTabProps) {
  return (
    <MasterBudgetMatrix
      targetYear={targetYear}
      currentMonthIdx={currentMonthIdx}
      budgetItems={budgetItems}
      onStartEdit={onStartEdit}
      onStartAdd={onStartAdd}
    />
  );
}
