import { FREQUENCIES, recurringRules } from "@acc/db";
import { initialNextRunDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const recurringInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["income", "expense"]),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  amount: decimal,
  currency: z.string().length(3).optional(),
  frequency: z.enum(FREQUENCIES),
  interval: z.number().int().min(1).max(365).default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  anchorDate: isoDate,
  endDate: isoDate.optional(),
  note: z.string().max(500).optional(),
});

export const recurringRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: recurringRules.id,
        name: recurringRules.name,
        kind: recurringRules.kind,
        accountId: recurringRules.accountId,
        categoryId: recurringRules.categoryId,
        amountMinor: recurringRules.amountMinor,
        currency: recurringRules.currency,
        frequency: recurringRules.frequency,
        interval: recurringRules.interval,
        dayOfMonth: recurringRules.dayOfMonth,
        weekday: recurringRules.weekday,
        anchorDate: recurringRules.anchorDate,
        nextRunDate: recurringRules.nextRunDate,
        endDate: recurringRules.endDate,
        note: recurringRules.note,
        active: recurringRules.active,
      })
      .from(recurringRules)
      .where(eq(recurringRules.userId, ctx.user.id))
      .orderBy(desc(recurringRules.createdAt));
  }),

  create: protectedProcedure.input(recurringInput).mutation(async ({ ctx, input }) => {
    const { accounts } = await import("@acc/db");
    const [acct] = await ctx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
      .limit(1);
    if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

    const currency = (input.currency ?? acct.currency).toUpperCase();
    const { amount } = fromDecimal(input.amount, currency);
    const schedule = {
      frequency: input.frequency,
      interval: input.interval,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
    };
    const nextRunDate = initialNextRunDate(input.anchorDate, schedule);

    const [created] = await ctx.db
      .insert(recurringRules)
      .values({
        userId: ctx.user.id,
        name: input.name,
        kind: input.kind,
        accountId: input.accountId,
        categoryId: input.categoryId,
        amountMinor: amount,
        currency,
        frequency: input.frequency,
        interval: input.interval,
        dayOfMonth: input.dayOfMonth,
        weekday: input.weekday,
        anchorDate: input.anchorDate,
        nextRunDate,
        endDate: input.endDate,
        note: input.note,
      })
      .returning();
    return created;
  }),

  update: protectedProcedure
    .input(
      recurringInput.partial().extend({
        id: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.id, input.id), eq(recurringRules.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到規則" });

      const currency = (input.currency ?? existing.currency).toUpperCase();
      const amountMinor = input.amount
        ? fromDecimal(input.amount, currency).amount
        : existing.amountMinor;

      const frequency = input.frequency ?? existing.frequency;
      const interval = input.interval ?? existing.interval;
      const dayOfMonth = input.dayOfMonth ?? existing.dayOfMonth;
      const weekday = input.weekday ?? existing.weekday;
      const anchorDate = input.anchorDate ?? existing.anchorDate;

      const nextRunDate =
        input.frequency || input.interval || input.dayOfMonth != null || input.weekday != null || input.anchorDate
          ? initialNextRunDate(anchorDate, {
              frequency,
              interval,
              dayOfMonth,
              weekday,
            })
          : existing.nextRunDate;

      const [updated] = await ctx.db
        .update(recurringRules)
        .set({
          name: input.name ?? existing.name,
          kind: input.kind ?? existing.kind,
          accountId: input.accountId ?? existing.accountId,
          categoryId: input.categoryId ?? existing.categoryId,
          amountMinor,
          currency,
          frequency,
          interval,
          dayOfMonth,
          weekday,
          anchorDate,
          nextRunDate,
          endDate: input.endDate ?? existing.endDate,
          note: input.note ?? existing.note,
        })
        .where(eq(recurringRules.id, input.id))
        .returning();
      return updated;
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(recurringRules)
        .set({ active: input.active })
        .where(and(eq(recurringRules.id, input.id), eq(recurringRules.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到規則" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(recurringRules)
        .where(and(eq(recurringRules.id, input.id), eq(recurringRules.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到規則" });
      return deleted;
    }),
});
