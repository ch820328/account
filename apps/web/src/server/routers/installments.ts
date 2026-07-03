import { accounts, installmentSchedules } from "@acc/db";
import { firstInstallmentDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

export const installmentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(installmentSchedules)
      .where(eq(installmentSchedules.userId, ctx.user.id))
      .orderBy(installmentSchedules.createdAt);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        accountId: z.string().uuid(),
        amount: decimal,
        currency: z.string().length(3).optional(),
        dayOfMonth: z.number().int().min(1).max(31).default(1),
        totalPeriods: z.number().int().min(1).max(120),
        categoryId: z.string().uuid().optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      const currency = (input.currency ?? acct.currency).toUpperCase();
      const [created] = await ctx.db
        .insert(installmentSchedules)
        .values({
          userId: ctx.user.id,
          name: input.name,
          accountId: input.accountId,
          amountMinor: fromDecimal(input.amount, currency).amount,
          currency,
          dayOfMonth: input.dayOfMonth,
          nextRunDate: firstInstallmentDate(input.dayOfMonth),
          totalPeriods: input.totalPeriods,
          categoryId: input.categoryId,
          note: input.note,
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
        amount: decimal.optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        totalPeriods: z.number().int().min(1).max(120).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(installmentSchedules)
        .where(
          and(eq(installmentSchedules.id, input.id), eq(installmentSchedules.userId, ctx.user.id)),
        )
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到分期" });

      const finished =
        existing.totalPeriods != null && existing.completedPeriods >= existing.totalPeriods;
      if (finished) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已結清的分期無法編輯" });
      }

      let accountId = existing.accountId;
      let currency = existing.currency;
      if (input.accountId) {
        const [acct] = await ctx.db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
          .limit(1);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });
        accountId = acct.id;
        currency = acct.currency;
      }

      const totalPeriods = input.totalPeriods ?? existing.totalPeriods;
      if (totalPeriods == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "請設定總期數" });
      }
      if (totalPeriods < existing.completedPeriods) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `總期數不可小於已扣 ${existing.completedPeriods} 期`,
        });
      }

      const dayOfMonth = input.dayOfMonth ?? existing.dayOfMonth;
      const amountMinor = input.amount
        ? fromDecimal(input.amount, currency).amount
        : existing.amountMinor;

      const done = existing.completedPeriods >= totalPeriods;

      const [updated] = await ctx.db
        .update(installmentSchedules)
        .set({
          name: input.name ?? existing.name,
          accountId,
          amountMinor,
          currency,
          dayOfMonth,
          totalPeriods,
          categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
          note: input.note !== undefined ? input.note : existing.note,
          nextRunDate:
            input.dayOfMonth != null
              ? firstInstallmentDate(dayOfMonth)
              : existing.nextRunDate,
          active: done ? false : existing.active,
        })
        .where(eq(installmentSchedules.id, input.id))
        .returning();
      return updated;
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(installmentSchedules)
        .set({ active: input.active })
        .where(
          and(eq(installmentSchedules.id, input.id), eq(installmentSchedules.userId, ctx.user.id)),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到分期" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(installmentSchedules)
        .where(
          and(eq(installmentSchedules.id, input.id), eq(installmentSchedules.userId, ctx.user.id)),
        )
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到分期" });
      return deleted;
    }),
});
