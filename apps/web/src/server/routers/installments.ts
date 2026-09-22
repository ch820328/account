import { accounts, installmentSchedules } from "@acc/db";
import { firstInstallmentDate, generateDueInstallments } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

function getNextRunDateForMonth(firstMonth: string, dayOfMonth: number): string {
  const [yearStr, monthStr] = firstMonth.split("-");
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10) - 1; // 0-indexed month
  const d = new Date(year, month, dayOfMonth);
  const lastDay = new Date(year, month + 1, 0).getDate();
  d.setDate(Math.min(dayOfMonth, lastDay));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
        firstMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
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
      const nextRunDate = input.firstMonth
        ? getNextRunDateForMonth(input.firstMonth, input.dayOfMonth)
        : firstInstallmentDate(input.dayOfMonth);

      const [created] = await ctx.db
        .insert(installmentSchedules)
        .values({
          userId: ctx.user.id,
          name: input.name,
          accountId: input.accountId,
          amountMinor: fromDecimal(input.amount, currency).amount,
          currency,
          dayOfMonth: input.dayOfMonth,
          nextRunDate,
          totalPeriods: input.totalPeriods,
          categoryId: input.categoryId,
          note: input.note,
        })
        .returning();
      await generateDueInstallments(ctx.db);
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
        firstMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
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

      let nextRunDate = existing.nextRunDate;
      if (input.firstMonth) {
        nextRunDate = getNextRunDateForMonth(input.firstMonth, dayOfMonth);
      } else if (input.dayOfMonth != null) {
        const [yStr, mStr] = existing.nextRunDate.split("-");
        nextRunDate = getNextRunDateForMonth(`${yStr}-${mStr}`, dayOfMonth);
      }

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
          nextRunDate,
          active: done ? false : existing.active,
        })
        .where(eq(installmentSchedules.id, input.id))
        .returning();
      await generateDueInstallments(ctx.db);
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
