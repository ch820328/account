import { accounts, loanPaymentSchedules, loanPaymentTiers } from "@acc/db";
import { firstLoanPaymentDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

const tierInput = z
  .object({
    fromPeriod: z.number().int().min(1).max(1200),
    toPeriod: z.number().int().min(1).max(1200),
    amount: decimal,
  })
  .refine((t) => t.toPeriod >= t.fromPeriod, { message: "結束期數不可小於起始期數" });

function tierValues(
  scheduleId: string,
  currency: string,
  tiers: { fromPeriod: number; toPeriod: number; amount: string }[],
) {
  return tiers.map((t) => ({
    scheduleId,
    fromPeriod: t.fromPeriod,
    toPeriod: t.toPeriod,
    amountMinor: fromDecimal(t.amount, currency).amount,
  }));
}

export const loanPaymentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const schedules = await ctx.db
      .select()
      .from(loanPaymentSchedules)
      .where(eq(loanPaymentSchedules.userId, ctx.user.id))
      .orderBy(loanPaymentSchedules.createdAt);

    if (schedules.length === 0) return [];

    const tiers = await ctx.db
      .select()
      .from(loanPaymentTiers)
      .where(inArray(loanPaymentTiers.scheduleId, schedules.map((s) => s.id)))
      .orderBy(asc(loanPaymentTiers.fromPeriod));

    const tiersBySchedule = new Map<string, typeof tiers>();
    for (const t of tiers) {
      const list = tiersBySchedule.get(t.scheduleId);
      if (list) list.push(t);
      else tiersBySchedule.set(t.scheduleId, [t]);
    }

    return schedules.map((s) => ({ ...s, tiers: tiersBySchedule.get(s.id) ?? [] }));
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
        totalPeriods: z.number().int().min(1).max(1200).optional(),
        tiers: z.array(tierInput).max(12).optional(),
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

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
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
            totalPeriods: input.totalPeriods,
            note: input.note,
          })
          .returning();

        const tiers = tierValues(created!.id, currency, input.tiers ?? []);
        if (tiers.length) await tx.insert(loanPaymentTiers).values(tiers);
        return created;
      });
    }),

  /** Create the liability account and its repayment schedule atomically. */
  createWithLiability: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        owedBalance: decimal.default("0"),
        sourceAccountId: z.string().uuid(),
        amount: decimal,
        dayOfMonth: z.number().int().min(1).max(31).default(1),
        totalPeriods: z.number().int().min(1).max(1200).optional(),
        loanRateAnnual: decimal.optional(),
        tiers: z.array(tierInput).max(12).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [source] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.sourceAccountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "找不到扣款帳戶" });

      const currency = source.currency.toUpperCase();
      const amountMinor = fromDecimal(input.amount, currency).amount;
      const nextRunDate = firstLoanPaymentDate(input.dayOfMonth);

      return ctx.db.transaction(async (tx) => {
        const [liability] = await tx
          .insert(accounts)
          .values({
            userId: ctx.user.id,
            name: input.name,
            type: "loan",
            currency,
            openingBalanceMinor: fromDecimal(input.owedBalance, currency).amount,
            loanRateAnnual: input.loanRateAnnual,
          })
          .returning();

        const [created] = await tx
          .insert(loanPaymentSchedules)
          .values({
            userId: ctx.user.id,
            name: input.name,
            liabilityAccountId: liability!.id,
            sourceAccountId: input.sourceAccountId,
            amountMinor,
            currency,
            dayOfMonth: input.dayOfMonth,
            nextRunDate,
            totalPeriods: input.totalPeriods,
            note: input.note,
          })
          .returning();

        const tiers = tierValues(created!.id, currency, input.tiers ?? []);
        if (tiers.length) await tx.insert(loanPaymentTiers).values(tiers);
        return created;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        amount: decimal.optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        totalPeriods: z.number().int().min(1).max(1200).nullable().optional(),
        tiers: z.array(tierInput).max(12).optional(),
        note: z.string().max(500).nullable().optional(),
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
          totalPeriods: input.totalPeriods !== undefined ? input.totalPeriods : existing.totalPeriods,
          nextRunDate:
            input.dayOfMonth != null ? firstLoanPaymentDate(dayOfMonth) : existing.nextRunDate,
          note: input.note !== undefined ? input.note : existing.note,
        })
        .where(eq(loanPaymentSchedules.id, input.id))
        .returning();

      if (input.tiers) {
        await ctx.db.delete(loanPaymentTiers).where(eq(loanPaymentTiers.scheduleId, input.id));
        const tiers = tierValues(input.id, existing.currency, input.tiers);
        if (tiers.length) await ctx.db.insert(loanPaymentTiers).values(tiers);
      }

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
