import { describe, expect, it } from "vitest";
import { parseCategoryIds } from "./forecast";
import { cashDelta } from "./reports";

// ---------------------------------------------------------------------------
// parseCategoryIds
// ---------------------------------------------------------------------------
describe("parseCategoryIds", () => {
  it("returns null when empty / nullish", () => {
    expect(parseCategoryIds(null)).toBeNull();
    expect(parseCategoryIds(undefined)).toBeNull();
    expect(parseCategoryIds("")).toBeNull();
    expect(parseCategoryIds("  ,  ")).toBeNull();
  });

  it("parses a comma-separated list into a set", () => {
    const set = parseCategoryIds("a, b ,c");
    expect(set).not.toBeNull();
    expect([...set!].sort()).toEqual(["a", "b", "c"]);
  });

  it("handles single category without comma", () => {
    const set = parseCategoryIds("abc-123");
    expect(set).not.toBeNull();
    expect([...set!]).toEqual(["abc-123"]);
  });

  it("deduplicates repeated ids", () => {
    const set = parseCategoryIds("a, a, b");
    expect(set).not.toBeNull();
    expect(set!.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cashDelta — pure balance-effect helper
// ---------------------------------------------------------------------------
describe("cashDelta", () => {
  describe("income", () => {
    it("adds to cash when source is an asset account", () => {
      expect(cashDelta({ type: "income", amtBase: 1000n, sourceIsAsset: true, destIsAsset: false }))
        .toBe(1000n);
    });

    it("is zero when source is NOT an asset account (e.g. liability income)", () => {
      expect(cashDelta({ type: "income", amtBase: 1000n, sourceIsAsset: false, destIsAsset: false }))
        .toBe(0n);
    });
  });

  describe("expense", () => {
    it("subtracts from cash when source is an asset account", () => {
      expect(cashDelta({ type: "expense", amtBase: 500n, sourceIsAsset: true, destIsAsset: false }))
        .toBe(-500n);
    });

    it("is zero when paid via liability (credit card)", () => {
      expect(cashDelta({ type: "expense", amtBase: 500n, sourceIsAsset: false, destIsAsset: false }))
        .toBe(0n);
    });
  });

  describe("transfer", () => {
    it("nets to zero for asset-to-asset transfer (same total cash)", () => {
      // e.g. bank → bank: -amount on source, +amount on dest = net 0
      expect(cashDelta({ type: "transfer", amtBase: 200n, sourceIsAsset: true, destIsAsset: true }))
        .toBe(0n);
    });

    it("reduces cash for asset → liability transfer (credit card repayment)", () => {
      // bank (asset) → credit card (liability): source -amount, dest is liability so not added
      expect(cashDelta({ type: "transfer", amtBase: 200n, sourceIsAsset: true, destIsAsset: false }))
        .toBe(-200n);
    });

    it("increases cash for liability → asset transfer (loan drawdown)", () => {
      // mortgage (liability) → bank (asset): source not asset, dest +amount
      expect(cashDelta({ type: "transfer", amtBase: 200n, sourceIsAsset: false, destIsAsset: true }))
        .toBe(200n);
    });

    it("is zero for liability-to-liability transfer", () => {
      expect(cashDelta({ type: "transfer", amtBase: 200n, sourceIsAsset: false, destIsAsset: false }))
        .toBe(0n);
    });
  });

  describe("unknown type", () => {
    it("returns zero for unrecognized transaction type", () => {
      expect(cashDelta({ type: "unknown", amtBase: 100n, sourceIsAsset: true, destIsAsset: true }))
        .toBe(0n);
    });
  });
});

// ---------------------------------------------------------------------------
// Savings rate formula (inline — no DB dependency)
// ---------------------------------------------------------------------------
describe("savings rate formula", () => {
  function savingsRate(incomeMinor: bigint, expenseMinor: bigint): number | null {
    if (incomeMinor === 0n) return null;
    return Number(((incomeMinor - expenseMinor) * 10000n) / incomeMinor) / 100;
  }

  it("returns 50% when spending is half of income", () => {
    expect(savingsRate(100_00n, 50_00n)).toBeCloseTo(50, 1);
  });

  it("returns 0% when spending equals income", () => {
    expect(savingsRate(100_00n, 100_00n)).toBe(0);
  });

  it("returns negative when spending exceeds income", () => {
    expect(savingsRate(100_00n, 150_00n)).toBeCloseTo(-50, 1);
  });

  it("returns null when income is zero (avoids division by zero)", () => {
    expect(savingsRate(0n, 50_00n)).toBeNull();
  });

  it("returns 100% when there is no spending", () => {
    expect(savingsRate(100_00n, 0n)).toBeCloseTo(100, 1);
  });
});
