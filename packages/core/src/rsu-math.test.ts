import { describe, expect, it } from "vitest";
import { netVestQuantity } from "./rsu";

describe("netVestQuantity (sell-to-cover)", () => {
  it("returns full quantity when no tax withheld", () => {
    expect(netVestQuantity("10", 0)).toBe("10");
  });
  it("removes the sold portion", () => {
    expect(netVestQuantity("10", 40)).toBe("6");
    expect(netVestQuantity("10", "25")).toBe("7.5");
  });
  it("clamps out-of-range percentages", () => {
    expect(netVestQuantity("10", 150)).toBe("0");
    expect(netVestQuantity("10", -5)).toBe("10");
  });
});
import { splitQuantityCeiling } from "./rsu-math";

describe("splitQuantityCeiling", () => {
  it("sums to total with ceiling distribution", () => {
    const parts = splitQuantityCeiling("100", 48);
    expect(parts).toHaveLength(48);
    const sum = parts.reduce((s, p) => s + Number(p), 0);
    expect(sum).toBe(100);
    expect(Number(parts[0])).toBeGreaterThanOrEqual(Math.ceil(100 / 48));
  });

  it("handles 480 shares over 48 months", () => {
    const parts = splitQuantityCeiling("480", 48);
    expect(parts.every((p) => Number(p) === 10)).toBe(true);
  });
});
