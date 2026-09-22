import { describe, expect, it } from "vitest";
import { amountForPeriod, type LoanTier } from "./loan-payments";

describe("amountForPeriod", () => {
  const tiers: LoanTier[] = [
    { fromPeriod: 1, toPeriod: 36, amountMinor: 1500000n, rateMargin: null, isGracePeriod: true },
    { fromPeriod: 37, toPeriod: 420, amountMinor: 2800000n, rateMargin: null, isGracePeriod: false },
  ];

  it("picks the grace-period amount for early periods", () => {
    expect(amountForPeriod(1, tiers, 0n)).toBe(1500000n);
    expect(amountForPeriod(36, tiers, 0n)).toBe(1500000n);
  });

  it("picks the amortizing amount after the grace period", () => {
    expect(amountForPeriod(37, tiers, 0n)).toBe(2800000n);
    expect(amountForPeriod(420, tiers, 0n)).toBe(2800000n);
  });

  it("falls back to the default when no tier matches", () => {
    expect(amountForPeriod(421, tiers, 999n)).toBe(999n);
    expect(amountForPeriod(1, [], 777n)).toBe(777n);
  });
});

describe("calculateNextLoanPaymentAmount", () => {
  it("computes interest only during grace period", async () => {
    const { calculateNextLoanPaymentAmount } = await import("./loan-payments");
    const schedule = {
      amortizationMethod: "equal_principal_interest",
      rateMargin: "0.5",
      completedPeriods: 0,
      totalPeriods: 360,
      amountMinor: 3000000n,
    };
    const tiers: LoanTier[] = [
      { fromPeriod: 1, toPeriod: 24, amountMinor: 0n, rateMargin: "0.5", isGracePeriod: true },
    ];
    // Principal: 10,000,000 TWD (1,000,000,000 minor). Base rate: 1.5%. Total rate: 2.0%.
    // Monthly interest = 1,000,000,000 * 0.02 / 12 = 1,666,667
    const pmt = calculateNextLoanPaymentAmount(schedule, tiers, [], 1000000000n, 1.5, 1);
    expect(pmt).toBe(1666667n);
  });

  it("computes amortizing payment after grace period", async () => {
    const { calculateNextLoanPaymentAmount } = await import("./loan-payments");
    const schedule = {
      amortizationMethod: "equal_principal_interest",
      rateMargin: "0.5",
      completedPeriods: 24,
      totalPeriods: 360,
      amountMinor: 0n,
    };
    const tiers: LoanTier[] = [];
    // Principal: 10,000,000 TWD. Base rate: 1.5%, Total: 2.0%. 336 periods left.
    const pmt = calculateNextLoanPaymentAmount(schedule, tiers, [], 1000000000n, 1.5, 25);
    expect(pmt).toBeGreaterThan(1666667n); // Amortizing payment must be higher than interest-only
  });

  describe("simulateLoanPrepayment", () => {
    it("simulates Option A (payment reduction) and Option B (term reduction)", async () => {
      const { simulateLoanPrepayment } = await import("./loan-payments");
      // Loan: 10,000,000 TWD (1000000000 minor)
      // Rate: 2.185%
      // 360 months left
      // Prepay: 1,000,000 TWD (100000000 minor)
      const res = simulateLoanPrepayment({
        currentPrincipalMinor: 1000000000n,
        prepaymentMinor: 100000000n,
        annualRatePct: 2.185,
        remainingPeriods: 360,
      });

      expect(res.isFullPayoff).toBe(false);
      expect(res.newPrincipalMinor).toBe(900000000n);

      // Option A: payment decreases, periods remain 360
      expect(res.optionA.newPaymentMinor).toBeLessThan(res.originalPaymentMinor);
      expect(res.optionA.monthlySavingsMinor).toBeGreaterThan(0n);
      expect(res.optionA.totalInterestSavedMinor).toBeGreaterThan(0n);

      // Option B: payment stays the same, periods shorten
      expect(res.optionB.paymentMinor).toBe(res.originalPaymentMinor);
      expect(res.optionB.periodsShortened).toBeGreaterThan(30); // At least 2.5+ years shortened
      expect(res.optionB.newRemainingPeriods).toBeLessThan(360);
      expect(res.optionB.totalInterestSavedMinor).toBeGreaterThan(res.optionA.totalInterestSavedMinor); // Term reduction saves more interest than payment reduction
    });

    it("handles full payoff correctly", async () => {
      const { simulateLoanPrepayment } = await import("./loan-payments");
      const res = simulateLoanPrepayment({
        currentPrincipalMinor: 500000000n,
        prepaymentMinor: 500000000n,
        annualRatePct: 2.0,
        remainingPeriods: 120,
      });

      expect(res.isFullPayoff).toBe(true);
      expect(res.newPrincipalMinor).toBe(0n);
      expect(res.optionA.newPaymentMinor).toBe(0n);
      expect(res.optionB.newRemainingPeriods).toBe(0);
      expect(res.optionB.periodsShortened).toBe(120);
    });
  });
});

