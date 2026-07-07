import { type Database, instruments } from "@acc/db";
import { getBaseCurrency } from "./currency";
import { ingestFxRates, ingestPrices, todayIsoDate } from "./sync";

const FX_QUOTE_CURRENCIES = [
  "TWD",
  "USD",
  "EUR",
  "JPY",
  "CNY",
  "HKD",
  "GBP",
  "AUD",
  "SGD",
  "KRW",
];

/** Primary FX provider: open.er-api.com (no key). Returns quote→rate map. */
async function fetchFxPrimary(base: string): Promise<Record<string, number>> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const data = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    "error-type"?: string;
  };
  if (data.result !== "success" || !data.rates) {
    throw new Error(`FX API error: ${data["error-type"] ?? "unknown"}`);
  }
  return data.rates;
}

/** Fallback FX provider: fawazahmed0 currency-api (no key), lowercase keys. */
async function fetchFxFallback(base: string): Promise<Record<string, number>> {
  const b = base.toLowerCase();
  const res = await fetch(
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.json`,
  );
  if (!res.ok) throw new Error(`FX fallback HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, Record<string, number>>;
  const table = data[b] ?? {};
  const upper: Record<string, number> = {};
  for (const [k, v] of Object.entries(table)) upper[k.toUpperCase()] = v;
  return upper;
}

/**
 * Refresh FX rates, storing base(BASE) → quote(F) so net-worth conversion can
 * invert them. Tries the primary provider then falls back to a second source.
 */
export async function refreshFxRates(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<{ written: number; source: string }> {
  const base = getBaseCurrency();

  let table: Record<string, number>;
  let source: string;
  try {
    table = await fetchFxPrimary(base);
    source = "open.er-api.com";
  } catch {
    table = await fetchFxFallback(base);
    source = "currency-api";
  }

  const rates = FX_QUOTE_CURRENCIES.filter((q) => q !== base && table[q] != null).map(
    (quote) => ({ base, quote, rate: String(table[quote]) }),
  );

  const { written } = await ingestFxRates(db, { asOf, source, rates });
  return { written, source };
}

interface TwseStockRow {
  Code: string;
  ClosingPrice: string;
}

async function fetchTwPrices(symbols: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const res = await fetch(
    "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`TWSE HTTP ${res.status}`);
  const list = (await res.json()) as TwseStockRow[];
  const byCode = new Map(list.map((r) => [r.Code, r.ClosingPrice]));
  for (const symbol of symbols) {
    const price = byCode.get(symbol);
    if (price && price !== "--" && price !== "") out.set(symbol, price);
  }
  return out;
}

async function fetchUsPrice(symbol: string): Promise<string | null> {
  // stooq CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  const res = await fetch(
    `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`,
  );
  if (!res.ok) return null;
  const csv = (await res.text()).trim();
  const lines = csv.split("\n");
  const cols = lines[1]?.split(",");
  const close = cols?.[6];
  if (!close || close === "N/D") return null;
  return close;
}

/**
 * Best-effort price refresh for instruments we track. TW via TWSE OpenAPI,
 * US via stooq. Tolerant: partial failures don't abort the whole run.
 */
export async function refreshPrices(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<{ updated: number; failed: number }> {
  const rows = await db.select().from(instruments);
  let updated = 0;
  let failed = 0;

  const tw = rows.filter((r) => r.market === "TW");
  const us = rows.filter((r) => r.market === "US");

  if (tw.length > 0) {
    try {
      const prices = await fetchTwPrices(tw.map((r) => r.symbol));
      const batch = tw
        .filter((r) => prices.has(r.symbol))
        .map((r) => ({
          symbol: r.symbol,
          market: "TW" as const,
          price: prices.get(r.symbol)!,
          currency: r.currency,
        }));
      if (batch.length) {
        const { written } = await ingestPrices(db, { asOf, source: "twse", prices: batch });
        updated += written;
      }
    } catch {
      failed += tw.length;
    }
  }

  for (const inst of us) {
    try {
      const price = await fetchUsPrice(inst.symbol);
      if (price) {
        await ingestPrices(db, {
          asOf,
          source: "stooq",
          prices: [{ symbol: inst.symbol, market: "US", price, currency: inst.currency }],
        });
        updated += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { updated, failed };
}
