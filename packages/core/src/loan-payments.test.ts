import { describe, expect, it } from "vitest";
import { amountForPeriod, type LoanTier } from "./loan-payments";

describe("amountForPeriod", () => {
  const tiers: LoanTier[] = [
    { fromPeriod: 1, toPeriod: 36, amountMinor: 1500000n },
    { fromPeriod: 37, toPeriod: 420, amountMinor: 2800000n },
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
