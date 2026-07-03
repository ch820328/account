import { describe, expect, it } from "vitest";
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
