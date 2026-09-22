import { describe, expect, it } from "vitest";
import { fxRateToBase, toBaseMinor } from "./net-worth";

describe("fxRateToBase & toBaseMinor", () => {
  it("returns 1 for identical currencies", () => {
    const rates = new Map<string, string>();
    expect(fxRateToBase("TWD", "TWD", rates)).toBe("1");
    expect(fxRateToBase("usd", "USD", rates)).toBe("1");
  });

  it("handles direct pair lookup", () => {
    const rates = new Map<string, string>([
      ["USD_TWD", "32.5"],
    ]);
    expect(fxRateToBase("USD", "TWD", rates)).toBe("32.5");
  });

  it("handles inverse pair lookup", () => {
    const rates = new Map<string, string>([
      ["USD_TWD", "32.0"],
    ]);
    // TWD to USD should invert 32.0 -> 1/32 = 0.03125
    const rate = fxRateToBase("TWD", "USD", rates);
    expect(rate).toBeDefined();
    expect(Number(rate)).toBeCloseTo(0.03125, 5);
  });

  it("handles USD cross-triangulation when no direct or inverse pair exists", () => {
    // We have JPY_USD and USD_TWD, but no JPY_TWD directly
    const rates = new Map<string, string>([
      ["JPY_USD", "0.0065"],
      ["USD_TWD", "32.0"],
    ]);

    // JPY -> TWD should cross: 0.0065 * 32.0 = 0.208
    const rate = fxRateToBase("JPY", "TWD", rates);
    expect(rate).toBeDefined();
    expect(Number(rate)).toBeCloseTo(0.208, 4);

    // Inverse cross: TWD -> JPY
    const invRate = fxRateToBase("TWD", "JPY", rates);
    expect(invRate).toBeDefined();
    expect(Number(invRate)).toBeCloseTo(1 / 0.208, 2);
  });

  it("converts amountMinor to baseMinor correctly", () => {
    const rates = new Map<string, string>([
      ["USD_TWD", "30.0"],
    ]);
    // 10.00 USD (1000 minor) * 30 = 300.00 TWD (30000 minor)
    const baseMinor = toBaseMinor(1000n, "USD", "TWD", rates);
    expect(baseMinor).toBe(30000n);
  });
});
