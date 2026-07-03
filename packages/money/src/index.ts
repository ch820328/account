/**
 * Money is stored as integer minor units (e.g. cents) using `bigint` to avoid
 * floating-point rounding errors. Every amount carries its ISO 4217 currency
 * code. All arithmetic is exact; only explicit conversions round, and they
 * round half away from zero.
 */
export interface Money {
  /** Amount in minor units (e.g. 12345 => 123.45 for a 2-decimal currency). */
  readonly amount: bigint;
  /** Upper-case ISO 4217 currency code, e.g. "TWD", "USD". */
  readonly currency: string;
}

/** Number of decimal places (minor-unit exponent) per currency. */
const CURRENCY_EXPONENTS: Record<string, number> = {
  TWD: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CNY: 2,
  HKD: 2,
  AUD: 2,
  CAD: 2,
  SGD: 2,
  JPY: 0,
  KRW: 0,
};

const DEFAULT_EXPONENT = 2;

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? DEFAULT_EXPONENT;
}

const DECIMAL_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)$/;

/** Round |n|/d half away from zero. `d` must be positive. */
function roundedDiv(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const q = abs / d;
  const r = abs % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Parse a decimal string into an integer scaled to `decimals` places. */
function parseDecimalToScaled(input: string, decimals: number): bigint {
  const s = input.trim();
  if (!DECIMAL_RE.test(s)) {
    throw new Error(`Invalid decimal value: "${input}"`);
  }
  const negative = s.startsWith("-");
  const unsigned = s.replace(/^[-+]/, "");
  const [intPart = "", fracPart = ""] = unsigned.split(".");
  const fracForScale = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const digits = (intPart || "0") + fracForScale;
  let scaled = BigInt(digits);
  const nextDigit = fracPart[decimals];
  if (nextDigit !== undefined && Number(nextDigit) >= 5) {
    scaled += 1n;
  }
  return negative ? -scaled : scaled;
}

/** Parse a decimal string into `{ mantissa, scale }` where value = mantissa / 10^scale. */
function parseDecimalToMantissa(input: string): { mantissa: bigint; scale: number } {
  const s = input.trim();
  if (!DECIMAL_RE.test(s)) {
    throw new Error(`Invalid decimal value: "${input}"`);
  }
  const negative = s.startsWith("-");
  const unsigned = s.replace(/^[-+]/, "");
  const [intPart = "", fracPart = ""] = unsigned.split(".");
  const mantissa = BigInt((intPart || "0") + fracPart);
  return { mantissa: negative ? -mantissa : mantissa, scale: fracPart.length };
}

/** Create Money directly from minor units. */
export function money(amount: bigint, currency: string): Money {
  return { amount, currency: currency.toUpperCase() };
}

/** Create Money from a human decimal value ("123.45" or 123.45). */
export function fromDecimal(value: string | number, currency: string): Money {
  const exp = currencyExponent(currency);
  return {
    amount: parseDecimalToScaled(String(value), exp),
    currency: currency.toUpperCase(),
  };
}

/** Zero amount in the given currency. */
export function zero(currency: string): Money {
  return { amount: 0n, currency: currency.toUpperCase() };
}

export function isZero(m: Money): boolean {
  return m.amount === 0n;
}

export function isNegative(m: Money): boolean {
  return m.amount < 0n;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function negate(m: Money): Money {
  return { amount: -m.amount, currency: m.currency };
}

/** Sum a list of Money. Requires a currency when the list may be empty. */
export function sum(items: Money[], currency?: string): Money {
  if (items.length === 0) {
    if (!currency) throw new Error("sum() of empty list requires a currency");
    return zero(currency);
  }
  return items.reduce((acc, m) => add(acc, m));
}

/** Multiply money by a decimal factor (e.g. shares * price). Rounds half away from zero. */
export function multiply(m: Money, factor: string | number): Money {
  const { mantissa, scale } = parseDecimalToMantissa(String(factor));
  const product = m.amount * mantissa;
  const divisor = 10n ** BigInt(scale);
  return { amount: roundedDiv(product, divisor), currency: m.currency };
}

/**
 * Convert money to another currency using an exchange rate expressed as a
 * decimal string/number: 1 unit of `from` = `rate` units of `to`.
 * Rescales between differing minor-unit exponents and rounds half away from zero.
 */
export function convert(m: Money, rate: string | number, to: string): Money {
  const target = to.toUpperCase();
  const { mantissa, scale } = parseDecimalToMantissa(String(rate));
  if (mantissa < 0n) throw new Error(`Exchange rate must be non-negative: ${rate}`);

  const fromExp = currencyExponent(m.currency);
  const toExp = currencyExponent(target);

  // value_to(minor@toExp) = amount(minor@fromExp) * rate * 10^(toExp - fromExp)
  let numerator = m.amount * mantissa;
  let denominator = 10n ** BigInt(scale);

  const expDiff = toExp - fromExp;
  if (expDiff > 0) {
    numerator *= 10n ** BigInt(expDiff);
  } else if (expDiff < 0) {
    denominator *= 10n ** BigInt(-expDiff);
  }

  return { amount: roundedDiv(numerator, denominator), currency: target };
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount;
}

/** Convert to a plain decimal string, e.g. { 12345n, TWD } => "123.45". */
export function toDecimalString(m: Money): string {
  const exp = currencyExponent(m.currency);
  const negative = m.amount < 0n;
  const abs = (negative ? -m.amount : m.amount).toString();
  if (exp === 0) return (negative ? "-" : "") + abs;
  const padded = abs.padStart(exp + 1, "0");
  const intPart = padded.slice(0, padded.length - exp);
  const fracPart = padded.slice(padded.length - exp);
  return `${negative ? "-" : ""}${intPart}.${fracPart}`;
}

export function toNumber(m: Money): number {
  return Number(toDecimalString(m));
}

/** Human-readable formatting via Intl, e.g. "NT$123.45". */
export function formatMoney(m: Money, locale = "zh-TW"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: m.currency,
      minimumFractionDigits: currencyExponent(m.currency),
    }).format(toNumber(m));
  } catch {
    return `${m.currency} ${toDecimalString(m)}`;
  }
}
