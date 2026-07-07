import { computeNetWorth } from "@acc/core";
import { netWorthSnapshots } from "@acc/db";
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const netWorthRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    return computeNetWorth(ctx.db, ctx.user.id);
  }),

  history: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(1825).default(365) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 365;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString().slice(0, 10);

      const rows = await ctx.db
        .select({
          asOf: netWorthSnapshots.asOf,
          currency: netWorthSnapshots.currency,
          totalMinor: netWorthSnapshots.totalMinor,
          assetsMinor: netWorthSnapshots.assetsMinor,
          liabilitiesMinor: netWorthSnapshots.liabilitiesMinor,
          cashAndBankMinor: netWorthSnapshots.cashAndBankMinor,
          investmentsMinor: netWorthSnapshots.investmentsMinor,
        })
        .from(netWorthSnapshots)
        .where(
          and(
            eq(netWorthSnapshots.userId, ctx.user.id),
            gte(netWorthSnapshots.asOf, sinceIso),
          ),
        )
        .orderBy(asc(netWorthSnapshots.asOf));

      return rows;
    }),
});
