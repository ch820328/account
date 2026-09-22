import { accounts, dcaSchedules } from "@acc/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { initialNextRunDate } from "@acc/core";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MARKETS = ["TW", "US"] as const;

export const dcaRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(dcaSchedules)
      .where(eq(dcaSchedules.userId, ctx.user.id))
      .orderBy(dcaSchedules.createdAt);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        accountId: z.string().uuid(),
        brokerAccountId: z.string().uuid().optional(),
        symbol: z.string().min(1).max(20),
        market: z.enum(MARKETS),
        amount: decimal,
        currency: z.string().length(3).default("TWD"),
        dayOfMonth: z.number().int().min(1).max(31).default(6),
        startDate: isoDate,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const amountMinor = BigInt(Math.round(Number(input.amount) * 100));
      const nextRunDate = initialNextRunDate(input.startDate, {
        frequency: "monthly",
        interval: 1,
        dayOfMonth: input.dayOfMonth,
        weekday: null,
      });

      const [created] = await ctx.db
        .insert(dcaSchedules)
        .values({
          userId: ctx.user.id,
          name: input.name,
          accountId: input.accountId,
          brokerAccountId: input.brokerAccountId || null,
          symbol: input.symbol,
          market: input.market,
          amountMinor,
          currency: input.currency,
          dayOfMonth: input.dayOfMonth,
          nextRunDate,
          active: true,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        accountId: z.string().uuid().optional(),
        brokerAccountId: z.string().uuid().nullable().optional(),
        amount: decimal.optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(dcaSchedules)
        .where(and(eq(dcaSchedules.id, input.id), eq(dcaSchedules.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該定投排程" });

      const amountMinor = input.amount ? BigInt(Math.round(Number(input.amount) * 100)) : undefined;

      const [updated] = await ctx.db
        .update(dcaSchedules)
        .set({
          name: input.name,
          accountId: input.accountId,
          brokerAccountId: input.brokerAccountId,
          amountMinor,
          active: input.active,
        })
        .where(eq(dcaSchedules.id, input.id))
        .returning();
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(dcaSchedules)
        .where(and(eq(dcaSchedules.id, input.id), eq(dcaSchedules.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該排程" });
      return deleted;
    }),
});
