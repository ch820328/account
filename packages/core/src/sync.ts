import { type Database, fxRates, holdings, instruments, priceSnapshots, user } from "@acc/db";
import { fromDecimal } from "@acc/money";
import { and, eq, notInArray, sql } from "drizzle-orm";

export type Market = "TW" | "US";
export type InstrumentType = "stock" | "etf" | "fund" | "crypto";

export interface InstrumentInput {
  symbol: string;
  market: Market;
  name: string;
  currency: string;
  type: InstrumentType;
}

export interface PriceInput {
  symbol: string;
  market: Market;
  price: string;
  currency: string;
}

export interface HoldingInput {
  symbol: string;
  market: Market;
  quantity: string;
  avgCost?: string;
  costCurrency?: string;
  accountId?: string;
}

export interface FxRateInput {
  base: string;
  quote: string;
  rate: string;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Single-user install: use SYNC_USER_ID, else the first user in DB. */
export async function resolveSyncUserId(db: Database): Promise<string> {
  const configured = process.env.SYNC_USER_ID;
  if (configured) return configured;

  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  if (!row) {
    throw new Error("No user found. Register in the web UI first, or set SYNC_USER_ID.");
  }
  return row.id;
}

export async function upsertInstruments(db: Database, items: InstrumentInput[]) {
  let upserted = 0;
  for (const item of items) {
    await db
      .insert(instruments)
      .values({
        symbol: item.symbol,
        market: item.market,
        name: item.name,
        currency: item.currency.toUpperCase(),
        type: item.type,
      })
      .onConflictDoUpdate({
        target: [instruments.symbol, instruments.market],
        set: {
          name: item.name,
          currency: item.currency.toUpperCase(),
          type: item.type,
        },
      });
    upserted += 1;
  }
  return { upserted };
}

async function getInstrumentId(
  db: Database,
  symbol: string,
  market: Market,
): Promise<string | null> {
  const [row] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(and(eq(instruments.symbol, symbol), eq(instruments.market, market)))
    .limit(1);
  return row?.id ?? null;
}

export async function ingestPrices(
  db: Database,
  input: { asOf: string; source: string; prices: PriceInput[] },
) {
  let written = 0;
  let skipped = 0;

  for (const p of input.prices) {
    const instrumentId = await getInstrumentId(db, p.symbol, p.market);
    if (!instrumentId) {
      skipped += 1;
      continue;
    }

    await db
      .insert(priceSnapshots)
      .values({
        instrumentId,
        price: p.price,
        currency: p.currency.toUpperCase(),
        asOf: input.asOf,
        source: input.source,
      })
      .onConflictDoUpdate({
        target: [priceSnapshots.instrumentId, priceSnapshots.asOf],
        set: {
          price: p.price,
          currency: p.currency.toUpperCase(),
          source: input.source,
        },
      });
    written += 1;
  }

  return { written, skipped };
}

export async function ingestFxRates(
  db: Database,
  input: { asOf: string; source: string; rates: FxRateInput[] },
) {
  let written = 0;
  for (const r of input.rates) {
    await db
      .insert(fxRates)
      .values({
        base: r.base.toUpperCase(),
        quote: r.quote.toUpperCase(),
        rate: r.rate,
        asOf: input.asOf,
        source: input.source,
      })
      .onConflictDoUpdate({
        target: [fxRates.base, fxRates.quote, fxRates.asOf],
        set: { rate: r.rate, source: input.source },
      });
    written += 1;
  }
  return { written };
}

export async function ingestHoldings(
  db: Database,
  userId: string,
  input: { source: string; replace: boolean; holdings: HoldingInput[] },
) {
  const touchedInstrumentIds: string[] = [];

  for (const h of input.holdings) {
    const instrumentId = await getInstrumentId(db, h.symbol, h.market);
    if (!instrumentId) continue;

    touchedInstrumentIds.push(instrumentId);

    const costCurrency = (h.costCurrency ?? "TWD").toUpperCase();
    const avgCostMinor = h.avgCost
      ? fromDecimal(h.avgCost, costCurrency).amount
      : null;

    const [existing] = await db
      .select({ id: holdings.id })
      .from(holdings)
      .where(and(eq(holdings.userId, userId), eq(holdings.instrumentId, instrumentId)))
      .limit(1);

    if (existing) {
      await db
        .update(holdings)
        .set({
          quantity: h.quantity,
          avgCostMinor,
          costCurrency: avgCostMinor !== null ? costCurrency : null,
          accountId: h.accountId ?? null,
          updatedAt: sql`now()`,
        })
        .where(eq(holdings.id, existing.id));
    } else {
      await db.insert(holdings).values({
        userId,
        instrumentId,
        quantity: h.quantity,
        avgCostMinor,
        costCurrency: avgCostMinor !== null ? costCurrency : null,
        accountId: h.accountId,
      });
    }
  }

  if (input.replace) {
    if (input.holdings.length === 0) {
      await db.delete(holdings).where(eq(holdings.userId, userId));
    } else if (touchedInstrumentIds.length > 0) {
      await db
        .delete(holdings)
        .where(
          and(eq(holdings.userId, userId), notInArray(holdings.instrumentId, touchedInstrumentIds)),
        );
    }
  }

  return { upserted: touchedInstrumentIds.length };
}
