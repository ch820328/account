import { describe, it, expect } from "vitest";
import { calculateBudgetAllocations } from "./annual-budgets";

describe("calculateBudgetAllocations", () => {
  it("correctly amortizes rolling budgets over remaining months (electricity bill scenario)", () => {
    // Scenario: Electricity budget $30,000.
    // In Jan (month 1): no record.
    // In Feb (month 2): paid $4,000.
    // Current month is 3 (March). Remaining months = 10 (March through Dec).
    // Remaining budget = 30,000 - 4,000 = 26,000.
    // Monthly allocation for months 3..12 = 26,000 / 10 = 2,600 each!

    const monthActuals = new Map<number, bigint>();
    const monthHasRecords = new Map<number, boolean>();
    for (let m = 1; m <= 12; m++) {
      monthActuals.set(m, 0n);
      monthHasRecords.set(m, false);
    }
    monthActuals.set(2, 400_000n); // $4,000
    monthHasRecords.set(2, true);

    const res = calculateBudgetAllocations({
      targetYear: 2026,
      currentMonthIdx: 3,
      annualAmountMinor: 3_000_000n, // $30,000
      allocationType: "rolling",
      targetMonthsStr: null,
      monthActuals,
      monthHasRecords,
    });

    expect(res.spentAmountMinor).toBe(400_000n);
    expect(res.remainingAmountMinor).toBe(2_600_000n);
    expect(res.remainingMonthsCount).toBe(10);
    expect(res.dynamicFutureMonthlyMinor).toBe(250_000n); // $2,500 / month steady baseline
    expect(res.months.length).toBe(12);

    // Month 1: 0 (no record in past)
    expect(res.months[0]?.effectiveMinor).toBe(0n);
    expect(res.months[0]?.isActual).toBe(true);

    // Month 2: 4,000 (actual recorded)
    expect(res.months[1]?.effectiveMinor).toBe(400_000n);
    expect(res.months[1]?.isActual).toBe(true);

    // Month 3..12: each 2,500 (steady monthly baseline)
    for (let i = 2; i < 12; i++) {
      expect(res.months[i]?.effectiveMinor).toBe(250_000n);
      expect(res.months[i]?.isActual).toBe(false);
    }
  });

  it("strictly allocates fixed month items only in targeted months (May house tax scenario)", () => {
    // Scenario: May House tax $12,000 in month 5.
    // Current month is 3 (March).
    const monthActuals = new Map<number, bigint>();
    const monthHasRecords = new Map<number, boolean>();
    for (let m = 1; m <= 12; m++) {
      monthActuals.set(m, 0n);
      monthHasRecords.set(m, false);
    }

    const res = calculateBudgetAllocations({
      targetYear: 2026,
      currentMonthIdx: 3,
      annualAmountMinor: 1_200_000n, // $12,000
      allocationType: "fixed_months",
      targetMonthsStr: "5",
      monthActuals,
      monthHasRecords,
    });

    expect(res.targetMonthsList).toEqual([5]);
    expect(res.remainingMonthsCount).toBe(1);
    expect(res.dynamicFutureMonthlyMinor).toBe(1_200_000n);
    expect(res.months.length).toBe(12);

    // Months 1..4: 0
    for (let m = 1; m <= 4; m++) {
      expect(res.months[m - 1]?.effectiveMinor).toBe(0n);
    }

    // Month 5: $12,000
    expect(res.months[4]?.effectiveMinor).toBe(1_200_000n);
    expect(res.months[4]?.isActual).toBe(false);

    // Months 6..12: 0
    for (let m = 6; m <= 12; m++) {
      expect(res.months[m - 1]?.effectiveMinor).toBe(0n);
    }
  });

  it("splits quarterly fixed months evenly across target periods (1, 4, 7, 10)", () => {
    const monthActuals = new Map<number, bigint>();
    const monthHasRecords = new Map<number, boolean>();
    for (let m = 1; m <= 12; m++) {
      monthActuals.set(m, 0n);
      monthHasRecords.set(m, false);
    }

    const res = calculateBudgetAllocations({
      targetYear: 2026,
      currentMonthIdx: 1,
      annualAmountMinor: 5_400_000n, // $54,000
      allocationType: "fixed_months",
      targetMonthsStr: "1,4,7,10",
      monthActuals,
      monthHasRecords,
    });

    expect(res.targetMonthsList).toEqual([1, 4, 7, 10]);
    expect(res.dynamicFutureMonthlyMinor).toBe(1_350_000n); // $13,500 / quarter
    expect(res.months.length).toBe(12);

    expect(res.months[0]?.effectiveMinor).toBe(1_350_000n); // 1月
    expect(res.months[1]?.effectiveMinor).toBe(0n); // 2月
    expect(res.months[2]?.effectiveMinor).toBe(0n); // 3月
    expect(res.months[3]?.effectiveMinor).toBe(1_350_000n); // 4月
    expect(res.months[6]?.effectiveMinor).toBe(1_350_000n); // 7月
    expect(res.months[9]?.effectiveMinor).toBe(1_350_000n); // 10月
  });
});
