import { describe, expect, it } from "vitest";
import { applyTransactionToBalance } from "./balances";

describe("applyTransactionToBalance", () => {
  it("leaves balance unchanged on transfer for single ledger leg", () => {
    expect(applyTransactionToBalance(1000n, "transfer", 500n, false)).toBe(1000n);
    expect(applyTransactionToBalance(1000n, "transfer", 500n, true)).toBe(1000n);
  });

  it("handles asset account income and expense correctly", () => {
    // Assets: Income increases balance, expense decreases balance
    expect(applyTransactionToBalance(1000n, "income", 500n, false)).toBe(1500n);
    expect(applyTransactionToBalance(1000n, "expense", 300n, false)).toBe(700n);
  });

  it("handles liability account income and expense correctly", () => {
    // Liabilities: Expense increases owed balance, income (payment/refund) decreases owed balance
    expect(applyTransactionToBalance(1000n, "expense", 500n, true)).toBe(1500n);
    expect(applyTransactionToBalance(1000n, "income", 300n, true)).toBe(700n);
  });
});
