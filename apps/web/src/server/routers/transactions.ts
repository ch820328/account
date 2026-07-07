import { accounts, auditLog, categories, transactions, TRANSACTION_TYPES } from "@acc/db";
import {
  categoryExpenseTotals,
  incomeExpenseTrend,
  monthCategoryTotals,
  monthlyBreakdown,
  monthlyHistory,
  upcomingScheduled,
} from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { type SQL, and, desc, eq, gte, ilike, lt, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

export const transactionsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
          type: z.enum(TRANSACTION_TYPES).optional(),
          accountId: z.string().uuid().optional(),
          categoryId: z.string().uuid().optional(),
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          search: z.string().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const destAccounts = ctx.db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .as("dest_accounts");

      const conditions: (SQL | undefined)[] = [eq(transactions.userId, ctx.user.id)];
      if (input?.type) conditions.push(eq(transactions.type, input.type));
      if (input?.categoryId) conditions.push(eq(transactions.categoryId, input.categoryId));
      if (input?.accountId) {
        conditions.push(
          or(
            eq(transactions.accountId, input.accountId),
            eq(transactions.transferAccountId, input.accountId),
          ),
        );
      }
      if (input?.month) {
        const [y, m] = input.month.split("-").map(Number);
        conditions.push(gte(transactions.occurredAt, new Date(y!, m! - 1, 1)));
        conditions.push(lt(transactions.occurredAt, new Date(y!, m!, 1)));
      }
      if (input?.search) conditions.push(ilike(transactions.note, `%${input.search}%`));

      const rows = await ctx.db
        .select({
          id: transactions.id,
          type: transactions.type,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
          source: transactions.source,
          accountId: transactions.accountId,
          accountName: accounts.name,
          transferAccountId: transactions.transferAccountId,
          transferAccountName: destAccounts.name,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(destAccounts, eq(transactions.transferAccountId, destAccounts.id))
        .where(and(...conditions))
        .orderBy(desc(transactions.occurredAt))
        .limit((input?.limit ?? 50) + 1)
        .offset(input?.offset ?? 0);

      const limit = input?.limit ?? 50;
      const hasMore = rows.length > limit;
      return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
    }),

  create: protectedProcedure
    .input(
      z
        .object({
          accountId: z.string().uuid(),
          categoryId: z.string().uuid().optional(),
          type: z.enum(TRANSACTION_TYPES),
          amount: decimal,
          currency: z.string().length(3).optional(),
          occurredAt: z.date().optional(),
          note: z.string().max(500).optional(),
          transferAccountId: z.string().uuid().optional(),
        })
        .refine(
          (v) => v.type !== "transfer" || (v.transferAccountId && v.transferAccountId !== v.accountId),
          { message: "轉帳需選擇不同的入帳帳戶" },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      if (input.type === "transfer") {
        if (!input.transferAccountId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "請選擇入帳帳戶" });
        }
        const [dest] = await ctx.db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.id, input.transferAccountId), eq(accounts.userId, ctx.user.id)),
          )
          .limit(1);
        if (!dest) throw new TRPCError({ code: "NOT_FOUND", message: "找不到入帳帳戶" });
      }

      const currency = (input.currency ?? acct.currency).toUpperCase();
      const { amount } = fromDecimal(input.amount, currency);

      const [created] = await ctx.db
        .insert(transactions)
        .values({
          userId: ctx.user.id,
          accountId: input.accountId,
          transferAccountId: input.type === "transfer" ? input.transferAccountId : undefined,
          categoryId: input.type === "transfer" ? undefined : input.categoryId,
          type: input.type,
          amountMinor: amount,
          currency,
          occurredAt: input.occurredAt ?? new Date(),
          note: input.note,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: decimal.optional(),
        categoryId: z.string().uuid().nullable().optional(),
        occurredAt: z.date().optional(),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到交易" });

      const amountMinor = input.amount
        ? fromDecimal(input.amount, existing.currency).amount
        : existing.amountMinor;

      const [updated] = await ctx.db
        .update(transactions)
        .set({
          amountMinor,
          categoryId:
            input.categoryId !== undefined
              ? existing.type === "transfer"
                ? null
                : input.categoryId
              : existing.categoryId,
          occurredAt: input.occurredAt ?? existing.occurredAt,
          note: input.note !== undefined ? input.note : existing.note,
        })
        .where(eq(transactions.id, input.id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到交易" });

      const amount = (Number(deleted.amountMinor) / 100).toLocaleString();
      await ctx.db.insert(auditLog).values({
        userId: ctx.user.id,
        action: "delete",
        entity: "transaction",
        summary: `${deleted.type} ${amount} ${deleted.currency}${deleted.note ? ` · ${deleted.note}` : ""}`,
      });
      return deleted;
    }),

  monthlyBreakdown: protectedProcedure.query(async ({ ctx }) => {
    return monthlyBreakdown(ctx.db, ctx.user.id);
  }),

  trend: protectedProcedure
    .input(z.object({ months: z.number().int().min(3).max(36).default(12) }).optional())
    .query(async ({ ctx, input }) => {
      return incomeExpenseTrend(ctx.db, ctx.user.id, input?.months ?? 12);
    }),

  categoryTotals: protectedProcedure
    .input(z.object({ year: z.number().int().min(2000).max(2100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return categoryExpenseTotals(ctx.db, ctx.user.id, input?.year);
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return monthlyHistory(ctx.db, ctx.user.id);
  }),

  upcoming: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      return upcomingScheduled(ctx.db, ctx.user.id, input?.days ?? 30);
    }),

  monthCategories: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      return monthCategoryTotals(ctx.db, ctx.user.id, input.month);
    }),

  monthlySummary: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = await ctx.db
      .select({
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
      })
      .from(transactions)
      .where(
        and(eq(transactions.userId, ctx.user.id), gte(transactions.occurredAt, startOfMonth)),
      );

    const byCurrency = new Map<string, { income: bigint; expense: bigint }>();
    for (const row of rows) {
      const entry = byCurrency.get(row.currency) ?? { income: 0n, expense: 0n };
      if (row.type === "income") entry.income += row.amountMinor;
      else if (row.type === "expense") entry.expense += row.amountMinor;
      byCurrency.set(row.currency, entry);
    }

    return Array.from(byCurrency.entries()).map(([currency, v]) => ({
      currency,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));
  }),
});
