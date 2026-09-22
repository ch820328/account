import { computeNetWorth } from "@acc/core";
import { netWorthSnapshots } from "@acc/db";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

export const netWorthRouter = router({
  /**
   * Full net worth computation including per-account balances and holdings.
   * Used on the /net-worth detail page.
   * For homepage quick totals, use `latestSnapshot` instead.
   */
  summary: protectedProcedure
    .input(z.object({ baseCurrency: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return computeNetWorth(ctx.db, ctx.user.id, input?.baseCurrency);
    }),

  /**
   * Returns the most recent daily snapshot for quick total display on the
   * homepage — avoids re-running the full account/holding join every page load.
   * Falls back to null if no snapshot exists yet (first day of use).
   */
  latestSnapshot: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, ctx.user.id))
      .orderBy(desc(netWorthSnapshots.asOf))
      .limit(1);
    return row ?? null;
  }),

  /**
   * Month-over-Month and Year-over-Year net worth deltas.
   * Compares the latest snapshot against the closest snapshot ~30 days ago
   * and ~365 days ago.
   *
   * Returns null for a period if there is insufficient snapshot history.
   */
  deltas: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const d365 = new Date(now);
    d365.setDate(d365.getDate() - 365);

    const d30iso = d30.toISOString().slice(0, 10);
    const d365iso = d365.toISOString().slice(0, 10);

    // Latest snapshot (today's value)
    const [latest] = await ctx.db
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, ctx.user.id))
      .orderBy(desc(netWorthSnapshots.asOf))
      .limit(1);

    if (!latest) return { currency: null, mom: null, yoy: null };

    // Snapshot closest to 30 days ago
    const [snap30] = await ctx.db
      .select()
      .from(netWorthSnapshots)
      .where(
        and(
          eq(netWorthSnapshots.userId, ctx.user.id),
          lte(netWorthSnapshots.asOf, d30iso),
        ),
      )
      .orderBy(desc(netWorthSnapshots.asOf))
      .limit(1);

    // Snapshot closest to 365 days ago
    const [snap365] = await ctx.db
      .select()
      .from(netWorthSnapshots)
      .where(
        and(
          eq(netWorthSnapshots.userId, ctx.user.id),
          lte(netWorthSnapshots.asOf, d365iso),
        ),
      )
      .orderBy(desc(netWorthSnapshots.asOf))
      .limit(1);

    function delta(current: bigint, past: bigint) {
      const d = current - past;
      // deltaPct as two-decimal-place float (e.g. 8.53 for +8.53%)
      const deltaPct = past !== 0n ? Number((d * 10000n) / past) / 100 : null;
      return { deltaMinor: d, deltaPct, pastMinor: past };
    }

    return {
      currency: latest.currency,
      currentMinor: latest.totalMinor,
      mom: snap30 ? delta(latest.totalMinor, snap30.totalMinor) : null,
      yoy: snap365 ? delta(latest.totalMinor, snap365.totalMinor) : null,
    };
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
