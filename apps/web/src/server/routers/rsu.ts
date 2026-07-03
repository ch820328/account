import { accounts, MARKETS, rsuGrants, rsuVests } from "@acc/db";
import { buildRsuVestSchedule, previewRsuSchedule } from "@acc/core";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const quantity = z.string().regex(/^\d+(\.\d+)?$/, "數量格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rsuRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const grants = await ctx.db
      .select()
      .from(rsuGrants)
      .where(eq(rsuGrants.userId, ctx.user.id))
      .orderBy(rsuGrants.createdAt);

    const result = [];
    for (const grant of grants) {
      const vests = await ctx.db
        .select()
        .from(rsuVests)
        .where(eq(rsuVests.grantId, grant.id))
        .orderBy(asc(rsuVests.periodIndex));
      const vested = vests.filter((v) => v.status === "vested").length;
      const next = vests.find((v) => v.status === "pending");
      result.push({ ...grant, vests, vestedCount: vested, nextVest: next ?? null });
    }
    return result;
  }),

  preview: protectedProcedure
    .input(
      z.object({
        totalQuantity: quantity,
        startDate: isoDate,
        periods: z.number().int().min(1).max(120).default(48),
      }),
    )
    .query(({ input }) => previewRsuSchedule(input.totalQuantity, input.startDate, input.periods)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        symbol: z.string().min(1).max(20),
        market: z.enum(MARKETS),
        brokerAccountId: z.string().uuid().optional(),
        totalQuantity: quantity,
        startDate: isoDate,
        periods: z.number().int().min(1).max(120).default(48),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.brokerAccountId) {
        const [acct] = await ctx.db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.id, input.brokerAccountId), eq(accounts.userId, ctx.user.id)),
          )
          .limit(1);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到證券戶" });
      }

      const [grant] = await ctx.db
        .insert(rsuGrants)
        .values({
          userId: ctx.user.id,
          name: input.name,
          symbol: input.symbol.toUpperCase(),
          market: input.market,
          brokerAccountId: input.brokerAccountId,
          totalQuantity: input.totalQuantity,
          startDate: input.startDate,
          periods: input.periods,
        })
        .returning();

      await buildRsuVestSchedule(
        ctx.db,
        grant!.id,
        input.totalQuantity,
        input.startDate,
        input.periods,
      );

      return grant;
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(rsuGrants)
        .set({ active: input.active })
        .where(and(eq(rsuGrants.id, input.id), eq(rsuGrants.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(rsuGrants)
        .where(and(eq(rsuGrants.id, input.id), eq(rsuGrants.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });
      return deleted;
    }),
});
