import { describe, expect, it } from "vitest";
import { cashDelta } from "./reports";

describe("cashDelta (month-end cash reconciliation)", () => {
  it("income to an asset account increases cash", () => {
    expect(cashDelta({ type: "income", amtBase: 500n, sourceIsAsset: true, destIsAsset: false })).toBe(500n);
  });

  it("expense from an asset account decreases cash", () => {
    expect(cashDelta({ type: "expense", amtBase: 300n, sourceIsAsset: true, destIsAsset: false })).toBe(-300n);
  });

  it("transfer between two asset accounts nets to zero", () => {
    expect(cashDelta({ type: "transfer", amtBase: 1000n, sourceIsAsset: true, destIsAsset: true })).toBe(0n);
  });

  it("loan payment (asset → liability) reduces cash", () => {
    expect(cashDelta({ type: "transfer", amtBase: 1000n, sourceIsAsset: true, destIsAsset: false })).toBe(-1000n);
  });

  it("income to a non-asset (liability) account does not change cash", () => {
    expect(cashDelta({ type: "income", amtBase: 500n, sourceIsAsset: false, destIsAsset: false })).toBe(0n);
  });
});
