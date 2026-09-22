import { describe, it, expect } from "vitest";
import { calculateTaiwanTax } from "./tax";

describe("calculateTaiwanTax", () => {
  it("correctly calculates Taiwan 2026 progressive tax with exemptions, married deduction, preschool child, and 3 installments", () => {
    const res = calculateTaiwanTax({
      grossIncomeMinor: 228_000_000n, // $2,280,000 (190k x 12)
      bonusIncomeMinor: 34_200_000n,  // $342,000
      stockGsuIncomeMinor: 92_400_000n, // $924,000
      otherIncomeMinor: 0n,
      dependentsCount: 4, // 4 x $97,000 = $388,000
      marriedFilingJointly: true, // $262,000
      youngChildrenCount: 1, // 1 x $150,000 = $150,000
      withheldTaxMinor: 31_590_000n, // $315,900
      installmentCount: 3,
      installmentStartMonth: 5,
    });

    // 1. Total Income
    expect(res.totalIncomeMinor).toBe(354_600_000n); // $3,546,000

    // 2. Deductions
    expect(res.exemptionsMinor).toBe(38_800_000n); // $388,000
    expect(res.standardDeductionMinor).toBe(26_200_000n); // $262,000
    expect(res.salaryDeductionMinor).toBe(21_800_000n); // $218,000 max
    expect(res.childDeductionMinor).toBe(15_000_000n); // $150,000
    expect(res.totalDeductionsMinor).toBe(101_800_000n); // $1,018,000

    // 3. Net Taxable Income
    expect(res.netTaxableIncomeMinor).toBe(252_800_000n); // $2,528,000

    // 4. Bracket: 20%
    expect(res.bracketRatePercent).toBe(20);
    expect(res.bracketProgressiveDifferenceMinor).toBe(14_770_000n); // $147,700

    // 5. Calculated Tax: 2,528,000 * 0.20 - 147,700 = $357,900
    expect(res.calculatedTaxMinor).toBe(35_790_000n);

    // 6. Tax Due: 357,900 - 315,900 = $42,000
    expect(res.taxDueMinor).toBe(4_200_000n);

    // 7. Installments: 3 periods in months 5, 6, 7
    expect(res.installmentMonths).toEqual([5, 6, 7]);
    expect(res.installmentAmountMinor).toBe(1_400_000n); // $14,000 each
  });

  it("handles low income under threshold with zero tax due", () => {
    const res = calculateTaiwanTax({
      grossIncomeMinor: 30_000_000n, // $300,000
      bonusIncomeMinor: 0n,
      stockGsuIncomeMinor: 0n,
      otherIncomeMinor: 0n,
      dependentsCount: 2,
      marriedFilingJointly: false,
      youngChildrenCount: 0,
      withheldTaxMinor: 500_000n,
      installmentCount: 1,
      installmentStartMonth: 5,
    });

    expect(res.netTaxableIncomeMinor).toBe(0n);
    expect(res.calculatedTaxMinor).toBe(0n);
    expect(res.taxDueMinor).toBe(0n);
    expect(res.installmentAmountMinor).toBe(0n);
  });
});
