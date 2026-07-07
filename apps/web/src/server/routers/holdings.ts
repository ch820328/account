import { MARKETS, holdings, instruments, priceSnapshots, accounts } from "@acc/db";
import { fromDecimal, multiply } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "數字格式不正確");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  /** Manually add or update a holding (shares + current price). */
  saveManual: protectedProcedure
    .input(
      z.object({
        symbol: z.string().min(1).max(20),
        market: z.enum(MARKETS),
        name: z.string().max(80).optional(),
        quantity: decimal,
        price: decimal,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const symbol = input.symbol.toUpperCase();
      const currency = input.market === "TW" ? "TWD" : "USD";

      return ctx.db.transaction(async (tx) => {
        let [instrument] = await tx
          .select()
          .from(instruments)
          .where(and(eq(instruments.symbol, symbol), eq(instruments.market, input.market)))
          .limit(1);

        if (!instrument) {
          [instrument] = await tx
            .insert(instruments)
            .values({
              symbol,
              market: input.market,
              name: input.name || symbol,
              currency,
              type: "stock",
            })
            .returning();
        } else if (input.name && input.name !== instrument.name) {
          await tx
            .update(instruments)
            .set({ name: input.name })
            .where(eq(instruments.id, instrument.id));
        }

        const instrumentId = instrument!.id;

        const [existing] = await tx
          .select({ id: holdings.id })
          .from(holdings)
          .where(and(eq(holdings.userId, ctx.user.id), eq(holdings.instrumentId, instrumentId)))
          .limit(1);

        if (existing) {
          await tx
            .update(holdings)
            .set({ quantity: input.quantity, updatedAt: new Date() })
            .where(eq(holdings.id, existing.id));
        } else {
          await tx.insert(holdings).values({
            userId: ctx.user.id,
            instrumentId,
            quantity: input.quantity,
          });
        }

        await tx
          .insert(priceSnapshots)
          .values({
            instrumentId,
            price: input.price,
            currency,
            asOf: todayIso(),
            source: "manual",
          })
          .onConflictDoUpdate({
            target: [priceSnapshots.instrumentId, priceSnapshots.asOf],
            set: { price: input.price, currency, source: "manual" },
          });

        return { ok: true };
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(holdings)
        .where(and(eq(holdings.id, input.id), eq(holdings.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到持股" });
      return deleted;
    }),
});
