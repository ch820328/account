import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  convert,
  currencyExponent,
  equals,
  fromDecimal,
  money,
  multiply,
  negate,
  subtract,
  sum,
  toDecimalString,
} from "./index";

describe("fromDecimal", () => {
  it("parses 2-decimal currencies", () => {
    expect(fromDecimal("123.45", "TWD").amount).toBe(12345n);
    expect(fromDecimal(123.45, "USD").amount).toBe(12345n);
  });

  it("parses 0-decimal currencies", () => {
    expect(fromDecimal("1000", "JPY").amount).toBe(1000n);
  });

  it("rounds half away from zero", () => {
    expect(fromDecimal("1.005", "USD").amount).toBe(101n);
    expect(fromDecimal("-1.005", "USD").amount).toBe(-101n);
    expect(fromDecimal("1.004", "USD").amount).toBe(100n);
  });

  it("handles leading-dot and sign", () => {
    expect(fromDecimal(".5", "USD").amount).toBe(50n);
    expect(fromDecimal("-0.01", "USD").amount).toBe(-1n);
  });

  it("uppercases the currency code", () => {
    expect(fromDecimal("1", "usd").currency).toBe("USD");
  });

  it("throws on garbage input", () => {
    expect(() => fromDecimal("abc", "USD")).toThrow();
    expect(() => fromDecimal("", "USD")).toThrow();
  });
});

describe("add / subtract / negate / sum", () => {
  it("adds and subtracts same currency", () => {
    expect(add(fromDecimal("1.10", "USD"), fromDecimal("2.20", "USD")).amount).toBe(330n);
    expect(subtract(fromDecimal("2.20", "USD"), fromDecimal("1.10", "USD")).amount).toBe(110n);
  });

  it("rejects mixed currencies", () => {
    expect(() => add(money(1n, "USD"), money(1n, "TWD"))).toThrow(/mismatch/i);
  });

  it("negates", () => {
    expect(negate(money(500n, "USD")).amount).toBe(-500n);
  });

  it("sums a list and an empty list with fallback currency", () => {
    expect(sum([fromDecimal("1", "USD"), fromDecimal("2", "USD")]).amount).toBe(300n);
    expect(sum([], "USD").amount).toBe(0n);
    expect(() => sum([])).toThrow();
  });
});

describe("multiply (shares * price)", () => {
  it("multiplies by a fractional quantity", () => {
    // 10.5 shares at $12.34 => 129.57
    expect(multiply(fromDecimal("12.34", "USD"), "10.5").amount).toBe(12957n);
  });

  it("rounds half away from zero", () => {
    // 1 minor unit * 1.5 = 1.5 -> 2
    expect(multiply(money(1n, "USD"), "1.5").amount).toBe(2n);
    expect(multiply(money(-1n, "USD"), "1.5").amount).toBe(-2n);
  });
});

describe("convert", () => {
  it("converts USD -> TWD (same exponent)", () => {
    // $100.00 * 31.5 = NT$3150.00
    const r = convert(fromDecimal("100.00", "USD"), "31.5", "TWD");
    expect(r.currency).toBe("TWD");
    expect(toDecimalString(r)).toBe("3150.00");
  });

  it("converts across differing exponents (USD -> JPY)", () => {
    // $10.00 * 150 = ¥1500
    const r = convert(fromDecimal("10.00", "USD"), "150", "JPY");
    expect(r.currency).toBe("JPY");
    expect(toDecimalString(r)).toBe("1500");
  });

  it("converts JPY -> USD", () => {
    // ¥1500 / 150 => $10.00  (rate 1 JPY = 0.006667 USD)
    const r = convert(money(1500n, "JPY"), "0.006667", "USD");
    expect(toDecimalString(r)).toBe("10.00");
  });

  it("rejects negative rates", () => {
    expect(() => convert(money(1n, "USD"), "-1", "TWD")).toThrow();
  });
});

describe("compare / equals / toDecimalString", () => {
  it("compares", () => {
    expect(compare(money(1n, "USD"), money(2n, "USD"))).toBe(-1);
    expect(compare(money(2n, "USD"), money(2n, "USD"))).toBe(0);
    expect(compare(money(3n, "USD"), money(2n, "USD"))).toBe(1);
  });

  it("checks equality including currency", () => {
    expect(equals(money(1n, "USD"), money(1n, "USD"))).toBe(true);
    expect(equals(money(1n, "USD"), money(1n, "TWD"))).toBe(false);
  });

  it("formats decimals", () => {
    expect(toDecimalString(money(12345n, "TWD"))).toBe("123.45");
    expect(toDecimalString(money(-5n, "USD"))).toBe("-0.05");
    expect(toDecimalString(money(1000n, "JPY"))).toBe("1000");
  });

  it("knows currency exponents", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("usd")).toBe(2);
    expect(currencyExponent("XYZ")).toBe(2);
  });
});
