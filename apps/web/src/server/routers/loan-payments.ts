import { accounts, loanPaymentSchedules, loanPaymentTiers, loanRateAdjustments, forecastSettings, transactions, categories } from "@acc/db";
import { firstLoanPaymentDate, simulateLoanPrepayment, totalAdjustmentForPeriod, parseIsoDate, todayIsoDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, gte, lte, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/, "金額格式不正確");

const tierInput = z
  .object({
    fromPeriod: z.number().int().min(1).max(1200),
    toPeriod: z.number().int().min(1).max(1200),
    amount: decimal,
    rateMargin: decimal.optional(),
    isGracePeriod: z.boolean().default(false).optional(),
  })
  .refine((t) => t.toPeriod >= t.fromPeriod, { message: "結束期數不可小於起始期數" });

const adjustmentInput = z.object({
  fromPeriod: z.number().int().min(1).max(1200),
  toPeriod: z.number().int().min(1).max(1200).nullable().optional(),
  adjustmentRate: decimal,
});

function tierValues(
  scheduleId: string,
  currency: string,
  tiers: { fromPeriod: number; toPeriod: number; amount: string; rateMargin?: string; isGracePeriod?: boolean }[],
) {
  return tiers.map((t) => ({
    scheduleId,
    fromPeriod: t.fromPeriod,
    toPeriod: t.toPeriod,
    isGracePeriod: t.isGracePeriod ?? false,
    amountMinor: fromDecimal(t.amount, currency).amount,
    rateMargin: t.rateMargin ?? null,
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

    const adjustments = await ctx.db
      .select()
      .from(loanRateAdjustments)
      .where(inArray(loanRateAdjustments.scheduleId, schedules.map((s) => s.id)))
      .orderBy(asc(loanRateAdjustments.fromPeriod));

    const adjustmentsBySchedule = new Map<string, typeof adjustments>();
    for (const adj of adjustments) {
      const list = adjustmentsBySchedule.get(adj.scheduleId);
      if (list) list.push(adj);
      else adjustmentsBySchedule.set(adj.scheduleId, [adj]);
    }

    return schedules.map((s) => ({
      ...s,
      tiers: tiersBySchedule.get(s.id) ?? [],
      adjustments: adjustmentsBySchedule.get(s.id) ?? [],
    }));
  }),

  getBaseRate: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select({ loanBaseRate: forecastSettings.loanBaseRate })
      .from(forecastSettings)
      .where(eq(forecastSettings.userId, ctx.user.id))
      .limit(1);
    return settings?.loanBaseRate ?? "1.85";
  }),

  updateBaseRate: protectedProcedure
    .input(z.object({ rate: decimal }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .insert(forecastSettings)
        .values({
          userId: ctx.user.id,
          loanBaseRate: input.rate,
        })
        .onConflictDoUpdate({
          target: forecastSettings.userId,
          set: { loanBaseRate: input.rate, updatedAt: new Date() },
        })
        .returning();
      return updated;
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
        firstRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        tiers: z.array(tierInput).max(12).optional(),
        note: z.string().max(500).optional(),
        amortizationMethod: z.string().optional(),
        rateMargin: decimal.optional(),
        adjustments: z.array(adjustmentInput).max(30).optional(),
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
      const nextRunDate = input.firstRunDate ?? firstLoanPaymentDate(input.dayOfMonth);

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
            amortizationMethod: input.amortizationMethod ?? "flat",
            rateMargin: input.rateMargin ?? "0",
          })
          .returning();

        const tiers = tierValues(created!.id, currency, input.tiers ?? []);
        if (tiers.length) await tx.insert(loanPaymentTiers).values(tiers);

        if (input.adjustments?.length) {
          await tx.insert(loanRateAdjustments).values(
            input.adjustments.map((a) => ({
              scheduleId: created!.id,
              fromPeriod: a.fromPeriod,
              toPeriod: a.toPeriod ?? null,
              adjustmentRate: a.adjustmentRate,
            }))
          );
        }

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
        firstRunDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        completedPeriods: z.number().int().min(0).optional(),
        loanRateAnnual: decimal.optional(),
        tiers: z.array(tierInput).max(12).optional(),
        note: z.string().max(500).optional(),
        amortizationMethod: z.string().optional(),
        rateMargin: decimal.optional(),
        adjustments: z.array(adjustmentInput).max(30).optional(),
        excludeFromNetWorth: z.boolean().optional(),
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
      const nextRunDate = input.firstRunDate ?? firstLoanPaymentDate(input.dayOfMonth);

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
            excludeFromNetWorth: input.excludeFromNetWorth ?? true, // Default to true for new loans since user requested it
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
            amortizationMethod: input.amortizationMethod ?? "flat",
            rateMargin: input.rateMargin ?? "0",
          })
          .returning();

        const tiers = tierValues(created!.id, currency, input.tiers ?? []);
        if (tiers.length) await tx.insert(loanPaymentTiers).values(tiers);

        if (input.adjustments?.length) {
          await tx.insert(loanRateAdjustments).values(
            input.adjustments.map((a) => ({
              scheduleId: created!.id,
              fromPeriod: a.fromPeriod,
              toPeriod: a.toPeriod ?? null,
              adjustmentRate: a.adjustmentRate,
            }))
          );
        }

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
        completedPeriods: z.number().int().min(0).optional(),
        totalPeriods: z.number().int().min(1).max(1200).nullable().optional(),
        tiers: z.array(tierInput).max(12).optional(),
        note: z.string().max(500).nullable().optional(),
        amortizationMethod: z.string().optional(),
        rateMargin: decimal.optional(),
        owedBalance: decimal.optional(),
        adjustments: z.array(adjustmentInput).max(30).optional(),
        excludeFromNetWorth: z.boolean().optional(),
        sourceAccountId: z.string().uuid().optional(),
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

      return ctx.db.transaction(async (tx) => {
        let sourceAccountId = existing.sourceAccountId;
        if (input.sourceAccountId) {
          const [source] = await tx
            .select()
            .from(accounts)
            .where(and(eq(accounts.id, input.sourceAccountId), eq(accounts.userId, ctx.user.id)))
            .limit(1);
          if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "找不到扣款帳戶" });
          sourceAccountId = source.id;
        }

        const [updated] = await tx
          .update(loanPaymentSchedules)
          .set({
            name: input.name ?? existing.name,
            amountMinor: input.amount
              ? fromDecimal(input.amount, existing.currency).amount
              : existing.amountMinor,
            dayOfMonth: input.dayOfMonth ?? existing.dayOfMonth,
            completedPeriods: input.completedPeriods ?? existing.completedPeriods,
            totalPeriods: input.totalPeriods !== undefined ? input.totalPeriods : existing.totalPeriods,
            nextRunDate:
              input.dayOfMonth != null ? firstLoanPaymentDate(input.dayOfMonth) : existing.nextRunDate,
            note: input.note !== undefined ? input.note : existing.note,
            amortizationMethod: input.amortizationMethod !== undefined ? input.amortizationMethod : existing.amortizationMethod,
            rateMargin: input.rateMargin !== undefined ? input.rateMargin : existing.rateMargin,
            sourceAccountId,
          })
          .where(eq(loanPaymentSchedules.id, input.id))
          .returning();

        if (input.owedBalance !== undefined) {
          await tx
            .update(accounts)
            .set({ openingBalanceMinor: fromDecimal(input.owedBalance, existing.currency).amount })
            .where(eq(accounts.id, existing.liabilityAccountId));
        }

        if (input.tiers) {
          await tx.delete(loanPaymentTiers).where(eq(loanPaymentTiers.scheduleId, input.id));
          const tiers = tierValues(input.id, existing.currency, input.tiers);
          if (tiers.length) await tx.insert(loanPaymentTiers).values(tiers);
        }

        if (input.adjustments) {
          await tx.delete(loanRateAdjustments).where(eq(loanRateAdjustments.scheduleId, input.id));
          if (input.adjustments.length) {
            await tx.insert(loanRateAdjustments).values(
              input.adjustments.map((a) => ({
                scheduleId: input.id,
                fromPeriod: a.fromPeriod,
                toPeriod: a.toPeriod ?? null,
                adjustmentRate: a.adjustmentRate,
              }))
            );
          }
        }

        if (input.excludeFromNetWorth !== undefined) {
          await tx
            .update(accounts)
            .set({ excludeFromNetWorth: input.excludeFromNetWorth })
            .where(eq(accounts.id, existing.liabilityAccountId));
        }

        return updated;
      });
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

  simulatePrepayment: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        amount: decimal,
      }),
    )
    .query(async ({ ctx, input }) => {
      const [schedule] = await ctx.db
        .select()
        .from(loanPaymentSchedules)
        .where(
          and(eq(loanPaymentSchedules.id, input.scheduleId), eq(loanPaymentSchedules.userId, ctx.user.id)),
        )
        .limit(1);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "找不到還款計畫" });

      const currentOwed = await getCurrentOwed(ctx.db, ctx.user.id, schedule.liabilityAccountId);

      const [settings] = await ctx.db
        .select({ loanBaseRate: forecastSettings.loanBaseRate })
        .from(forecastSettings)
        .where(eq(forecastSettings.userId, ctx.user.id))
        .limit(1);
      const baseRate = Number(settings?.loanBaseRate ?? "1.85");

      const adjustments = await ctx.db
        .select()
        .from(loanRateAdjustments)
        .where(eq(loanRateAdjustments.scheduleId, schedule.id));

      const nextPeriod = schedule.completedPeriods + 1;
      const adjustmentsTotal = totalAdjustmentForPeriod(
        nextPeriod,
        adjustments.map((a) => ({
          fromPeriod: a.fromPeriod,
          toPeriod: a.toPeriod,
          adjustmentRate: a.adjustmentRate,
        })),
      );

      const annualRatePct = baseRate + Number(schedule.rateMargin) + adjustmentsTotal;
      const remainingPeriods = schedule.totalPeriods
        ? Math.max(1, schedule.totalPeriods - schedule.completedPeriods)
        : 360;

      const prepaymentMinor = fromDecimal(input.amount, schedule.currency).amount;

      const sim = simulateLoanPrepayment({
        currentPrincipalMinor: currentOwed,
        prepaymentMinor,
        annualRatePct,
        remainingPeriods,
      });

      return {
        scheduleName: schedule.name,
        currency: schedule.currency,
        currentPrincipalMinor: sim.currentPrincipalMinor.toString(),
        prepaymentMinor: sim.prepaymentMinor.toString(),
        newPrincipalMinor: sim.newPrincipalMinor.toString(),
        annualRatePct: sim.annualRatePct,
        originalRemainingPeriods: sim.originalRemainingPeriods,
        originalPaymentMinor: sim.originalPaymentMinor.toString(),
        originalTotalInterestMinor: sim.originalTotalInterestMinor.toString(),
        isFullPayoff: sim.isFullPayoff,
        optionA: {
          newPaymentMinor: sim.optionA.newPaymentMinor.toString(),
          monthlySavingsMinor: sim.optionA.monthlySavingsMinor.toString(),
          newTotalInterestMinor: sim.optionA.newTotalInterestMinor.toString(),
          totalInterestSavedMinor: sim.optionA.totalInterestSavedMinor.toString(),
        },
        optionB: {
          paymentMinor: sim.optionB.paymentMinor.toString(),
          newRemainingPeriods: sim.optionB.newRemainingPeriods,
          periodsShortened: sim.optionB.periodsShortened,
          yearsMonthsShortened: sim.optionB.yearsMonthsShortened,
          newTotalInterestMinor: sim.optionB.newTotalInterestMinor.toString(),
          totalInterestSavedMinor: sim.optionB.totalInterestSavedMinor.toString(),
        },
      };
    }),

  executePrepayment: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        sourceAccountId: z.string().uuid(),
        amount: decimal,
        mode: z.enum(["reduce_payment", "reduce_term"]),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [schedule] = await ctx.db
        .select()
        .from(loanPaymentSchedules)
        .where(
          and(eq(loanPaymentSchedules.id, input.scheduleId), eq(loanPaymentSchedules.userId, ctx.user.id)),
        )
        .limit(1);
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "找不到還款計畫" });

      const [source] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.sourceAccountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "找不到扣款帳戶" });

      const prepaymentMinor = fromDecimal(input.amount, schedule.currency).amount;
      if (prepaymentMinor <= 0n) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "提前還本金額必須大於 0" });
      }

      const currentOwed = await getCurrentOwed(ctx.db, ctx.user.id, schedule.liabilityAccountId);
      if (prepaymentMinor > currentOwed && currentOwed > 0n) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "提前還本金額不可超過當前剩餘未償本金",
        });
      }

      const [settings] = await ctx.db
        .select({ loanBaseRate: forecastSettings.loanBaseRate })
        .from(forecastSettings)
        .where(eq(forecastSettings.userId, ctx.user.id))
        .limit(1);
      const baseRate = Number(settings?.loanBaseRate ?? "1.85");

      const adjustments = await ctx.db
        .select()
        .from(loanRateAdjustments)
        .where(eq(loanRateAdjustments.scheduleId, schedule.id));

      const nextPeriod = schedule.completedPeriods + 1;
      const adjustmentsTotal = totalAdjustmentForPeriod(
        nextPeriod,
        adjustments.map((a) => ({
          fromPeriod: a.fromPeriod,
          toPeriod: a.toPeriod,
          adjustmentRate: a.adjustmentRate,
        })),
      );

      const annualRatePct = baseRate + Number(schedule.rateMargin) + adjustmentsTotal;
      const remainingPeriods = schedule.totalPeriods
        ? Math.max(1, schedule.totalPeriods - schedule.completedPeriods)
        : 360;

      const sim = simulateLoanPrepayment({
        currentPrincipalMinor: currentOwed,
        prepaymentMinor,
        annualRatePct,
        remainingPeriods,
      });

      const txDate = input.date ? parseIsoDate(input.date) : new Date();

      return ctx.db.transaction(async (tx) => {
        // 1. Insert prepayment transfer
        const [createdTx] = await tx
          .insert(transactions)
          .values({
            userId: ctx.user.id,
            accountId: input.sourceAccountId,
            transferAccountId: schedule.liabilityAccountId,
            type: "transfer",
            amountMinor: prepaymentMinor,
            currency: schedule.currency,
            occurredAt: txDate,
            note: input.note || `[提前大額還本] ${schedule.name}`,
            source: "loan",
          })
          .returning();

        // 2. Adjust schedule if needed
        if (input.mode === "reduce_term") {
          const newTotalPeriods = schedule.completedPeriods + sim.optionB.newRemainingPeriods;
          await tx
            .update(loanPaymentSchedules)
            .set({ totalPeriods: newTotalPeriods })
            .where(eq(loanPaymentSchedules.id, schedule.id));
        } else if (input.mode === "reduce_payment") {
          if (schedule.amortizationMethod === "flat") {
            await tx
              .update(loanPaymentSchedules)
              .set({ amountMinor: sim.optionA.newPaymentMinor })
              .where(eq(loanPaymentSchedules.id, schedule.id));
          }
        }

        return {
          success: true,
          transactionId: createdTx?.id,
          mode: input.mode,
          prepaymentMinor: prepaymentMinor.toString(),
          newPrincipalMinor: sim.newPrincipalMinor.toString(),
        };
      });
    }),

  taxReport: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100) }))
    .query(async ({ ctx, input }) => {
      const year = input.year;
      const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const endOfYear = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

      // Get all loan schedules to map liability accounts to loan names
      const schedules = await ctx.db
        .select()
        .from(loanPaymentSchedules)
        .where(eq(loanPaymentSchedules.userId, ctx.user.id));

      const scheduleByLiab = new Map<string, typeof schedules[0]>();
      for (const s of schedules) {
        scheduleByLiab.set(s.liabilityAccountId, s);
      }

      // Query interest expense transactions
      const txRows = await ctx.db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          categoryId: transactions.categoryId,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
          source: transactions.source,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.type, "expense"),
            gte(transactions.occurredAt, startOfYear),
            lte(transactions.occurredAt, endOfYear),
          ),
        )
        .orderBy(asc(transactions.occurredAt));

      // Filter to interest transactions (source: "loan", or note contains "利息", or account is a loan liability)
      const interestTxs = txRows.filter((t) => {
        return (
          t.source === "loan" ||
          (t.note && t.note.includes("利息")) ||
          scheduleByLiab.has(t.accountId)
        );
      });

      let totalInterestMinor = 0n;
      const monthsMap = new Map<number, { amountMinor: bigint; count: number }>();
      for (let m = 1; m <= 12; m++) {
        monthsMap.set(m, { amountMinor: 0n, count: 0 });
      }

      const loanMap = new Map<string, { loanName: string; currency: string; amountMinor: bigint; count: number }>();

      const detailedList = [];

      for (const tx of interestTxs) {
        totalInterestMinor += tx.amountMinor;
        const d = new Date(tx.occurredAt);
        const m = d.getUTCMonth() + 1;
        const mData = monthsMap.get(m)!;
        mData.amountMinor += tx.amountMinor;
        mData.count += 1;

        const sched = scheduleByLiab.get(tx.accountId);
        const loanKey = tx.accountId;
        const loanName = sched ? sched.name : (tx.note ?? "房貸利息");
        const lData = loanMap.get(loanKey) ?? {
          loanName,
          currency: tx.currency,
          amountMinor: 0n,
          count: 0,
        };
        lData.amountMinor += tx.amountMinor;
        lData.count += 1;
        loanMap.set(loanKey, lData);

        detailedList.push({
          id: tx.id,
          loanName,
          occurredAt: tx.occurredAt.toISOString().slice(0, 10),
          month: m,
          amountMinor: tx.amountMinor.toString(),
          currency: tx.currency,
          note: tx.note,
        });
      }

      // Taiwan statutory deduction cap: NT$ 300,000 (30,000,000 minor units)
      const statutoryCapMinor = 30000000n;
      const eligibleDeductionMinor =
        totalInterestMinor > statutoryCapMinor ? statutoryCapMinor : totalInterestMinor;

      return {
        year,
        totalInterestMinor: totalInterestMinor.toString(),
        statutoryCapMinor: statutoryCapMinor.toString(),
        eligibleDeductionMinor: eligibleDeductionMinor.toString(),
        isCapped: totalInterestMinor > statutoryCapMinor,
        remainingCapMinor: (statutoryCapMinor > totalInterestMinor ? statutoryCapMinor - totalInterestMinor : 0n).toString(),
        capUsagePercent: Math.min(100, Number((eligibleDeductionMinor * 100n) / statutoryCapMinor)),
        byMonth: Array.from(monthsMap.entries()).map(([month, data]) => ({
          month,
          monthKey: `${year}-${String(month).padStart(2, "0")}`,
          amountMinor: data.amountMinor.toString(),
          count: data.count,
        })),
        byLoan: Array.from(loanMap.entries()).map(([accountId, data]) => ({
          accountId,
          loanName: data.loanName,
          currency: data.currency,
          amountMinor: data.amountMinor.toString(),
          count: data.count,
        })),
        transactions: detailedList,
      };
    }),
});

async function getCurrentOwed(db: any, userId: string, liabilityAccountId: string): Promise<bigint> {
  const [acct] = await db
    .select({ openingBalanceMinor: accounts.openingBalanceMinor })
    .from(accounts)
    .where(and(eq(accounts.id, liabilityAccountId), eq(accounts.userId, userId)))
    .limit(1);
  let currentOwed = acct ? acct.openingBalanceMinor : 0n;

  const txs = await db
    .select({
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      transferAmountMinor: transactions.transferAmountMinor,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(
          eq(transactions.accountId, liabilityAccountId),
          eq(transactions.transferAccountId, liabilityAccountId)
        )
      )
    );

  for (const tx of txs) {
    if (tx.accountId === liabilityAccountId) {
      if (tx.type === "transfer" || tx.type === "expense") {
        currentOwed += tx.amountMinor;
      } else if (tx.type === "income") {
        currentOwed -= tx.amountMinor;
      }
    }
    if (tx.transferAccountId === liabilityAccountId) {
      const amt = tx.transferAmountMinor !== null && tx.transferAmountMinor !== undefined
        ? tx.transferAmountMinor
        : tx.amountMinor;
      currentOwed -= amt;
    }
  }
  return currentOwed < 0n ? 0n : currentOwed;
}
