import { holdings, instruments, priceSnapshots, accounts } from "@acc/db";
import { fromDecimal, multiply } from "@acc/money";
import { desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";

export const holdingsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: holdings.id,
        quantity: holdings.quantity,
        avgCostMinor: holdings.avgCostMinor,
        costCurrency: holdings.costCurrency,
        instrumentId: holdings.instrumentId,
        symbol: instruments.symbol,
        market: instruments.market,
        name: instruments.name,
        currency: instruments.currency,
        type: instruments.type,
        accountName: accounts.name,
      })
      .from(holdings)
      .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
      .leftJoin(accounts, eq(holdings.accountId, accounts.id))
      .where(eq(holdings.userId, ctx.user.id))
      .orderBy(instruments.symbol);

    const instrumentIds = [...new Set(rows.map((r) => r.instrumentId))];
    const priceByInstrument = new Map<string, { price: string; currency: string; asOf: string }>();

    if (instrumentIds.length > 0) {
      const snapshots = await ctx.db
        .select()
        .from(priceSnapshots)
        .where(inArray(priceSnapshots.instrumentId, instrumentIds))
        .orderBy(desc(priceSnapshots.asOf));

      for (const snap of snapshots) {
        if (!priceByInstrument.has(snap.instrumentId)) {
          priceByInstrument.set(snap.instrumentId, {
            price: snap.price,
            currency: snap.currency,
            asOf: snap.asOf,
          });
        }
      }
    }

    return rows.map((row) => {
      const snap = priceByInstrument.get(row.instrumentId);
      let marketValueMinor: bigint | null = null;
      if (snap) {
        marketValueMinor = multiply(fromDecimal(snap.price, snap.currency), row.quantity).amount;
      }
      return {
        ...row,
        price: snap?.price ?? null,
        priceAsOf: snap?.asOf ?? null,
        marketValueMinor,
      };
    });
  }),
});
