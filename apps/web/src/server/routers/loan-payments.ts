import { accounts, loanPaymentSchedules } from "@acc/db";
import { firstLoanPaymentDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

export const loanPaymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(loanPaymentSchedules)
      .where(eq(loanPaymentSchedules.userId, ctx.user.id))
      .orderBy(loanPaymentSchedules.createdAt);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        liabilityAccountId: z.string().uuid(),
        sourceAccountId: z.string().uuid(),
        amount: decimal,
        currency: z.string().length(3).optional(),
        dayOfMonth: z.number().int().min(1).max(31).default(1),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [liability] = await ctx.db
        .select()
        .from(accounts)
        .where(
          and(eq(accounts.id, input.liabilityAccountId), eq(accounts.userId, ctx.user.id)),
        )
        .limit(1);
      const [source] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.sourceAccountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!liability || !source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });
      }

      const currency = (input.currency ?? source.currency).toUpperCase();
      const amountMinor = fromDecimal(input.amount, currency).amount;
      const nextRunDate = firstLoanPaymentDate(input.dayOfMonth);

      const [created] = await ctx.db
        .insert(loanPaymentSchedules)
        .values({
          userId: ctx.user.id,
          name: input.name,
          liabilityAccountId: input.liabilityAccountId,
          sourceAccountId: input.sourceAccountId,
          amountMinor,
          currency,
          dayOfMonth: input.dayOfMonth,
          nextRunDate,
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
        amount: decimal.optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(loanPaymentSchedules)
        .where(
          and(eq(loanPaymentSchedules.id, input.id), eq(loanPaymentSchedules.userId, ctx.user.id)),
        )
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到還款排程" });

      const dayOfMonth = input.dayOfMonth ?? existing.dayOfMonth;
      const [updated] = await ctx.db
        .update(loanPaymentSchedules)
        .set({
          name: input.name ?? existing.name,
          amountMinor: input.amount
            ? fromDecimal(input.amount, existing.currency).amount
            : existing.amountMinor,
          dayOfMonth,
          nextRunDate:
            input.dayOfMonth != null ? firstLoanPaymentDate(dayOfMonth) : existing.nextRunDate,
          note: input.note ?? existing.note,
        })
        .where(eq(loanPaymentSchedules.id, input.id))
        .returning();
      return updated;
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(loanPaymentSchedules)
        .set({ active: input.active })
        .where(
          and(eq(loanPaymentSchedules.id, input.id), eq(loanPaymentSchedules.userId, ctx.user.id)),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到還款排程" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(loanPaymentSchedules)
        .where(
          and(eq(loanPaymentSchedules.id, input.id), eq(loanPaymentSchedules.userId, ctx.user.id)),
        )
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到還款排程" });
      return deleted;
    }),
});
