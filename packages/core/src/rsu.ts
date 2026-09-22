import {
  type Database,
  holdings,
  instruments,
  priceSnapshots,
  rsuGrants,
  rsuVests,
  rsuSells,
} from "@acc/db";
import { and, desc, eq, lte, inArray } from "drizzle-orm";
import { parseIsoDate } from "./recurring";
import { addMonthsIso, calculateVestDateIso, splitQuantityCeiling } from "./rsu-math";
import { todayIsoDate } from "./sync";

export { splitQuantityCeiling, addMonthsIso, calculateVestDateIso };

/** Shares remaining after selling `sellToCoverPct`% to cover withholding tax. */
export function netVestQuantity(quantity: string, sellToCoverPct: string | number): string {
  const pct = Number(sellToCoverPct) || 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const net = Number(quantity) * (1 - clamped / 100);
  // Keep up to 4 decimals (fractional RSUs are common), trim trailing zeros.
  return String(Number(net.toFixed(4)));
}

/** Pure builder for the vest rows of a grant (no DB access). */
export function rsuVestRows(
  grantId: string,
  totalQuantity: string,
  startDate: string,
  periods: number,
  frequency: "monthly" | "quarterly" = "monthly",
  customVests?: { periodIndex: number; vestDate?: string; quantity: string }[]
) {
  if (customVests && customVests.length > 0) {
    return customVests.map((v, i) => ({
      grantId,
      periodIndex: v.periodIndex || i + 1,
      vestDate: v.vestDate || calculateVestDateIso(startDate, i, frequency),
      quantity: String(v.quantity),
      status: "pending" as const,
    }));
  }

  const quantities = splitQuantityCeiling(totalQuantity, periods);
  return quantities.map((quantity, i) => ({
    grantId,
    periodIndex: i + 1,
    vestDate: calculateVestDateIso(startDate, i, frequency),
    quantity,
    status: "pending" as const,
  }));
}

export async function buildRsuVestSchedule(
  db: Database,
  grantId: string,
  totalQuantity: string,
  startDate: string,
  periods: number,
): Promise<void> {
  await db.insert(rsuVests).values(rsuVestRows(grantId, totalQuantity, startDate, periods));
}

export async function findOrCreateInstrument(
  db: Database,
  symbol: string,
  market: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: instruments.id })
    .from(instruments)
    .where(
      and(
        eq(instruments.symbol, symbol),
        eq(instruments.market, market as "TW" | "US"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(instruments)
    .values({
      symbol,
      market: market as "TW" | "US",
      name: symbol,
      currency: market === "TW" ? "TWD" : "USD",
      type: "stock",
    })
    .returning({ id: instruments.id });
  return created!.id;
}

export interface ProcessRsuResult {
  processed: number;
  vested: number;
}

export async function processDueRsuVests(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<ProcessRsuResult> {
  const due = await db
    .select({
      vest: rsuVests,
      grant: rsuGrants,
    })
    .from(rsuVests)
    .innerJoin(rsuGrants, eq(rsuVests.grantId, rsuGrants.id))
    .where(
      and(
        eq(rsuGrants.active, true),
        eq(rsuVests.status, "pending"),
        lte(rsuVests.vestDate, asOf),
      ),
    );

  let vested = 0;

  for (const { vest, grant } of due) {
    const instrumentId = await findOrCreateInstrument(db, grant.symbol, grant.market);

    // Sell-to-cover: only the shares left after tax withholding are deposited.
    const netQuantity = netVestQuantity(vest.quantity, grant.sellToCoverPct);

    // Find the stock price on/before the vestDate
    const [priceSnap] = await db
      .select({ price: priceSnapshots.price })
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.instrumentId, instrumentId),
          lte(priceSnapshots.asOf, vest.vestDate)
        )
      )
      .orderBy(desc(priceSnapshots.asOf))
      .limit(1);
    const vestPrice = priceSnap?.price ?? "0";
    const vestPriceMinor = BigInt(Math.round(Number(vestPrice) * 100));

    // Atomic: deposit shares and mark the vest done together.
    await db.transaction(async (tx) => {
      if (grant.brokerAccountId && Number(netQuantity) > 0) {
        const [existing] = await tx
          .select({ id: holdings.id, quantity: holdings.quantity, avgCostMinor: holdings.avgCostMinor })
          .from(holdings)
          .where(
            and(
              eq(holdings.userId, grant.userId),
              eq(holdings.instrumentId, instrumentId),
              eq(holdings.accountId, grant.brokerAccountId),
            ),
          )
          .limit(1);

        if (existing) {
          const newQty = String(Number(existing.quantity) + Number(netQuantity));
          const existingQtyVal = Number(existing.quantity);
          const existingCostMinor = existing.avgCostMinor ?? 0n;
          const netQtyVal = Number(netQuantity);
          const totalCostMinor = (existingCostMinor * BigInt(Math.round(existingQtyVal * 100)) + vestPriceMinor * BigInt(Math.round(netQtyVal * 100))) / BigInt(Math.round((existingQtyVal + netQtyVal) * 100));

          await tx
            .update(holdings)
            .set({ quantity: newQty, avgCostMinor: totalCostMinor, updatedAt: new Date() })
            .where(eq(holdings.id, existing.id));
        } else {
          await tx.insert(holdings).values({
            userId: grant.userId,
            instrumentId,
            accountId: grant.brokerAccountId,
            quantity: netQuantity,
            avgCostMinor: vestPriceMinor,
            costCurrency: grant.market === "TW" ? "TWD" : "USD",
          });
        }
      }

      await tx
        .update(rsuVests)
        .set({ status: "vested", vestPrice })
        .where(eq(rsuVests.id, vest.id));
    });
    vested += 1;
  }

  return { processed: due.length, vested };
}

export async function previewRsuSchedule(
  totalQuantity: string,
  startDate: string,
  periods: number,
): Promise<{ periodIndex: number; vestDate: string; quantity: string }[]> {
  const quantities = splitQuantityCeiling(totalQuantity, periods);
  return quantities.map((quantity, i) => ({
    periodIndex: i + 1,
    vestDate: addMonthsIso(startDate, i),
    quantity,
  }));
}

export async function recalculateRsuHoldings(
  db: any,
  grantId: string,
): Promise<void> {
  const [grant] = await db
    .select()
    .from(rsuGrants)
    .where(eq(rsuGrants.id, grantId))
    .limit(1);

  if (!grant || !grant.brokerAccountId) return;

  const instrumentId = await findOrCreateInstrument(db, grant.symbol, grant.market);

  const allVests = await db
    .select()
    .from(rsuVests)
    .where(and(eq(rsuVests.grantId, grantId)));

  let totalVestedNetShares = 0;
  let totalCostMinor = 0n;

  for (const v of allVests) {
    if (v.status === "vested" || v.status === "sold") {
      const pct = v.sellToCoverPct !== null && v.sellToCoverPct !== undefined ? v.sellToCoverPct : grant.sellToCoverPct;
      const netQty = Number(v.quantity) * (1 - Number(pct) / 100);
      totalVestedNetShares += netQty;

      const price = Number(v.vestPrice || 0);
      const costBaseMinor = BigInt(Math.round(netQty * price * 100));
      totalCostMinor += costBaseMinor;
    }
  }

  const vestIds = allVests.map((v: any) => v.id);
  let totalSoldShares = 0;

  if (vestIds.length > 0) {
    const sells = await db
      .select()
      .from(rsuSells)
      .where(and(inArray(rsuSells.vestId, vestIds)));

    for (const s of sells) {
      totalSoldShares += Number(s.quantity);
    }
  }

  const currentShares = totalVestedNetShares - totalSoldShares;

  const [holding] = await db
    .select()
    .from(holdings)
    .where(
      and(
        eq(holdings.userId, grant.userId),
        eq(holdings.instrumentId, instrumentId),
        eq(holdings.accountId, grant.brokerAccountId)
      )
    )
    .limit(1);

  if (currentShares > 0) {
    const avgCostMinor = totalVestedNetShares > 0 ? totalCostMinor / BigInt(Math.round(totalVestedNetShares)) : 0n;
    if (holding) {
      await db
        .update(holdings)
        .set({
          quantity: String(currentShares),
          avgCostMinor,
          costCurrency: grant.market === "TW" ? "TWD" : "USD",
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));
    } else {
      await db.insert(holdings).values({
        userId: grant.userId,
        instrumentId,
        accountId: grant.brokerAccountId,
        quantity: String(currentShares),
        avgCostMinor,
        costCurrency: grant.market === "TW" ? "TWD" : "USD",
      });
    }
  } else {
    if (holding) {
      await db.delete(holdings).where(eq(holdings.id, holding.id));
    }
  }
}
