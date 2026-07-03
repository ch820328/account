import { accounts, categories, transactions, TRANSACTION_TYPES } from "@acc/db";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

export const transactionsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const destAccounts = ctx.db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .as("dest_accounts");

      const rows = await ctx.db
        .select({
          id: transactions.id,
          type: transactions.type,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
          accountId: transactions.accountId,
          accountName: accounts.name,
          transferAccountId: transactions.transferAccountId,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(eq(transactions.userId, ctx.user.id))
        .orderBy(desc(transactions.occurredAt))
        .limit(input?.limit ?? 50);

      const accountNames = await ctx.db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(eq(accounts.userId, ctx.user.id));
      const nameById = new Map(accountNames.map((a) => [a.id, a.name]));

      return rows.map((row) => ({
        ...row,
        transferAccountName: row.transferAccountId
          ? (nameById.get(row.transferAccountId) ?? null)
          : null,
      }));
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
