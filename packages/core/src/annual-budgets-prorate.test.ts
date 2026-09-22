import { describe, it, expect } from "vitest";
import { prorateTransactionByPeriod } from "./annual-budgets";

describe("prorateTransactionByPeriod", () => {
  it("returns empty map for invalid date strings", () => {
    expect(prorateTransactionByPeriod(10000n, "", "2026-05-01", 2026).size).toBe(0);
    expect(prorateTransactionByPeriod(10000n, "2026-05-01", "2026-04-01", 2026).size).toBe(0);
  });

  it("handles single-day transaction correctly", () => {
    const result = prorateTransactionByPeriod(50000n, "2026-03-15", "2026-03-15", 2026);
    expect(result.size).toBe(1);
    expect(result.get(3)).toBe(50000n);
  });

  it("prorates across two months within the same year with ceiling rounding", () => {
    // 2026-02-06 ~ 2026-04-14 ($193.00 = 19300n, 68 days total)
    // Feb (2026-02-06 to 2026-02-28) = 23 days: ceil(193 * 23 / 68) = ceil(65.338) = 66 -> 6600n
    // Mar (2026-03-01 to 2026-03-31) = 31 days: ceil(193 * 31 / 68) = ceil(87.985) = 88 -> 8800n
    // Apr (2026-04-01 to 2026-04-14) = 14 days: ceil(193 * 14 / 68) = ceil(39.735) = 40 -> 4000n
    const result = prorateTransactionByPeriod(19300n, "2026-02-06", "2026-04-14", 2026);
    expect(result.size).toBe(3);
    expect(result.get(2)).toBe(6600n);
    expect(result.get(3)).toBe(8800n);
    expect(result.get(4)).toBe(4000n);
  });

  it("handles periods spanning across year boundaries (only targetYear months are returned)", () => {
    // 2025-12-15 ~ 2026-01-14: 17 days in Dec 2025, 14 days in Jan 2026 (31 days total)
    const result = prorateTransactionByPeriod(310000n, "2025-12-15", "2026-01-14", 2026);
    expect(result.size).toBe(1);
    expect(result.has(1)).toBe(true);
    // 14 days out of 31 days: ceil(3100 * 14 / 31) = 1400 -> 140000n
    expect(result.get(1)).toBe(140000n);
  });
});
