import { FREQUENCIES, recurringRules, transactions } from "@acc/db";
import { initialNextRunDate } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const recurringInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["income", "expense", "transfer"]),
  accountId: z.string().uuid(),
  transferAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  amount: decimal,
  currency: z.string().length(3).optional(),
  frequency: z.enum(FREQUENCIES),
  interval: z.number().int().min(1).max(365).default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  anchorDate: isoDate,
  endDate: isoDate.optional(),
  times: z.number().int().min(1).optional(),
  note: z.string().max(500).optional(),
  autoCommit: z.boolean().default(true),
});

export const recurringRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { getBaseCurrency, latestFxRates, toBaseMinor } = await import("@acc/core");
    const baseCurrency = getBaseCurrency();
    const rates = await latestFxRates(ctx.db);

    const rows = await ctx.db
      .select({
        id: recurringRules.id,
        name: recurringRules.name,
        kind: recurringRules.kind,
        accountId: recurringRules.accountId,
        transferAccountId: recurringRules.transferAccountId,
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
        autoCommit: recurringRules.autoCommit,
        sortOrder: recurringRules.sortOrder,
      })
      .from(recurringRules)
      .where(eq(recurringRules.userId, ctx.user.id))
      .orderBy(asc(recurringRules.sortOrder), desc(recurringRules.createdAt));

    return rows.map((r) => ({
      ...r,
      baseCurrency,
      amountBaseMinor: r.currency === baseCurrency ? r.amountMinor : toBaseMinor(r.amountMinor, r.currency, baseCurrency, rates),
    }));
  }),

  create: protectedProcedure.input(recurringInput).mutation(async ({ ctx, input }) => {
    const { accounts } = await import("@acc/db");
    const [acct] = await ctx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
      .limit(1);
    if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

    if (input.kind === "transfer") {
      if (!input.transferAccountId || input.transferAccountId === input.accountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "轉帳需選擇不同的轉入帳戶" });
      }
      const [dest] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.transferAccountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!dest) throw new TRPCError({ code: "NOT_FOUND", message: "找不到轉入帳戶" });
    }

    const currency = (input.currency ?? acct.currency).toUpperCase();
    const { amount } = fromDecimal(input.amount, currency);
    const schedule = {
      frequency: input.frequency,
      interval: input.interval,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
    };
    const nextRunDate = initialNextRunDate(input.anchorDate, schedule);
    let calculatedEndDate = input.endDate;
    if (input.times) {
      const { advanceRecurringDate } = await import("@acc/core");
      let d = nextRunDate;
      for (let i = 1; i < input.times; i++) {
        d = advanceRecurringDate(d, schedule);
      }
      calculatedEndDate = d;
    }

    const [created] = await ctx.db
      .insert(recurringRules)
      .values({
        userId: ctx.user.id,
        name: input.name,
        kind: input.kind,
        accountId: input.accountId,
        transferAccountId: input.kind === "transfer" ? input.transferAccountId : null,
        categoryId: input.kind === "transfer" ? null : input.categoryId,
        amountMinor: amount,
        currency,
        frequency: input.frequency,
        interval: input.interval,
        dayOfMonth: input.dayOfMonth,
        weekday: input.weekday,
        anchorDate: input.anchorDate,
        nextRunDate,
        endDate: calculatedEndDate,
        note: input.note,
        autoCommit: input.autoCommit ?? true,
      })
      .returning();
    return created;
  }),

  update: protectedProcedure
    .input(
      recurringInput.partial().extend({
        id: z.string().uuid(),
        nextRunDate: isoDate.optional(),
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

      const nextRunDate = input.nextRunDate
        ? input.nextRunDate
        : (input.frequency || input.interval || input.dayOfMonth != null || input.weekday != null || input.anchorDate)
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
          autoCommit: input.autoCommit ?? existing.autoCommit,
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

  pendingManual: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    const currentMonthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

    return ctx.db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.userId, ctx.user.id),
          eq(recurringRules.active, true),
          eq(recurringRules.autoCommit, false),
          lte(recurringRules.nextRunDate, currentMonthEnd)
        )
      )
      .orderBy(asc(recurringRules.nextRunDate));
  }),

   executeManual: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        actualAmount: decimal.optional(),
        accountId: z.string().uuid().optional(),
        occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [rule] = await ctx.db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.id, input.id), eq(recurringRules.userId, ctx.user.id)))
        .limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "找不到規則" });

      const { fromDecimal } = await import("@acc/money");
      const amount = input.actualAmount ? fromDecimal(input.actualAmount, rule.currency).amount : rule.amountMinor;
      const targetAccountId = input.accountId || rule.accountId;

      const { parseIsoDate, advanceRecurringDate } = await import("@acc/core");
      const transactionDateStr = input.occurredAt || rule.nextRunDate;

      await ctx.db.transaction(async (tx) => {
        // Create transaction
        await tx.insert(transactions).values({
          userId: rule.userId,
          accountId: targetAccountId,
          transferAccountId: rule.kind === "transfer" ? rule.transferAccountId : null,
          categoryId: rule.kind === "transfer" ? null : rule.categoryId,
          type: rule.kind,
          amountMinor: amount,
          currency: rule.currency,
          occurredAt: parseIsoDate(transactionDateStr),
          note: rule.note ?? rule.name,
          source: "recurring",
          recurringRuleId: rule.id,
        });

        // Advance nextRunDate
        const schedule = {
          frequency: rule.frequency,
          interval: rule.interval,
          dayOfMonth: rule.dayOfMonth,
          weekday: rule.weekday,
        };
        const nextRun = advanceRecurringDate(rule.nextRunDate, schedule);
        const isActive = rule.endDate ? nextRun <= rule.endDate : true;

        await tx
          .update(recurringRules)
          .set({ nextRunDate: nextRun, active: isActive })
          .where(eq(recurringRules.id, rule.id));
      });
      return { success: true };
    }),

  postponeInstance: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [rule] = await ctx.db
        .select()
        .from(recurringRules)
        .where(and(eq(recurringRules.id, input.id), eq(recurringRules.userId, ctx.user.id)))
        .limit(1);
      if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "找不到規則" });

      const { advanceRecurringDate } = await import("@acc/core");
      const schedule = {
        frequency: rule.frequency,
        interval: rule.interval,
        dayOfMonth: rule.dayOfMonth,
        weekday: rule.weekday,
      };
      const nextRun = advanceRecurringDate(rule.nextRunDate, schedule);
      await ctx.db
        .update(recurringRules)
        .set({ nextRunDate: nextRun })
        .where(eq(recurringRules.id, rule.id));

      return { success: true, nextRun };
    }),

  toggleUnpaid: protectedProcedure
    .input(z.object({ ruleId: z.string().uuid(), date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const monthPrefix = input.date.slice(0, 7);
      const existing = await ctx.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.recurringRuleId, input.ruleId),
          )
        );

      for (const t of existing) {
        const d = t.occurredAt instanceof Date ? t.occurredAt.toISOString().slice(0, 7) : String(t.occurredAt).slice(0, 7);
        if (d === monthPrefix) {
          await ctx.db.delete(transactions).where(eq(transactions.id, t.id));
        }
      }
      return { success: true };
    }),

  updateSort: protectedProcedure
    .input(z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int() })))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const item of input) {
          await tx
            .update(recurringRules)
            .set({ sortOrder: item.sortOrder })
            .where(and(eq(recurringRules.id, item.id), eq(recurringRules.userId, ctx.user.id)));
        }
      });
      return { success: true };
    }),
});
