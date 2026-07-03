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

export async function buildRsuVestSchedule(
  db: Database,
  grantId: string,
  totalQuantity: string,
  startDate: string,
  periods: number,
): Promise<void> {
  const quantities = splitQuantityCeiling(totalQuantity, periods);
  const rows = quantities.map((quantity, i) => ({
    grantId,
    periodIndex: i + 1,
    vestDate: addMonthsIso(startDate, i),
    quantity,
    status: "pending" as const,
  }));
  await db.insert(rsuVests).values(rows);
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

    if (grant.brokerAccountId) {
      const [existing] = await db
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
        const newQty = String(Number(existing.quantity) + Number(vest.quantity));
        await db
          .update(holdings)
          .set({ quantity: newQty, updatedAt: new Date() })
          .where(eq(holdings.id, existing.id));
      } else {
        await db.insert(holdings).values({
          userId: grant.userId,
          instrumentId,
          accountId: grant.brokerAccountId,
          quantity: vest.quantity,
        });
      }
    }

    await db
      .update(rsuVests)
      .set({ status: "vested" })
      .where(eq(rsuVests.id, vest.id));
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
