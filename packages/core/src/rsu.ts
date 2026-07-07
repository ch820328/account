import {
  type Database,
  holdings,
  instruments,
  rsuGrants,
  rsuVests,
} from "@acc/db";
import { and, eq, lte } from "drizzle-orm";
import { parseIsoDate } from "./recurring";
import { addMonthsIso, splitQuantityCeiling } from "./rsu-math";
import { todayIsoDate } from "./sync";

export { splitQuantityCeiling, addMonthsIso };

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
) {
  const quantities = splitQuantityCeiling(totalQuantity, periods);
  return quantities.map((quantity, i) => ({
    grantId,
    periodIndex: i + 1,
    vestDate: addMonthsIso(startDate, i),
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

async function findOrCreateInstrument(
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

    // Atomic: deposit shares and mark the vest done together.
    await db.transaction(async (tx) => {
      if (grant.brokerAccountId && Number(netQuantity) > 0) {
        const [existing] = await tx
          .select({ id: holdings.id, quantity: holdings.quantity })
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
          await tx
            .update(holdings)
            .set({ quantity: newQty, updatedAt: new Date() })
            .where(eq(holdings.id, existing.id));
        } else {
          await tx.insert(holdings).values({
            userId: grant.userId,
            instrumentId,
            accountId: grant.brokerAccountId,
            quantity: netQuantity,
          });
        }
      }

      await tx.update(rsuVests).set({ status: "vested" }).where(eq(rsuVests.id, vest.id));
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
