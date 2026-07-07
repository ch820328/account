import { categories, categoryBudgets } from "@acc/db";
import { getBaseCurrency, monthExpenseByCategoryId } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

export const budgetsRouter = router({
  /** Expense categories with their monthly budget and this-month actual. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const cats = await ctx.db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, ctx.user.id), eq(categories.kind, "expense")))
      .orderBy(asc(categories.name));

    const budgets = await ctx.db
      .select()
      .from(categoryBudgets)
      .where(eq(categoryBudgets.userId, ctx.user.id));
    const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b]));

    const actualById = await monthExpenseByCategoryId(ctx.db, ctx.user.id);
    const base = getBaseCurrency();

    return cats.map((c) => ({
      categoryId: c.id,
      name: c.name,
      currency: budgetByCat.get(c.id)?.currency ?? base,
      budgetMinor: budgetByCat.get(c.id)?.amountMinor ?? null,
      actualMinor: actualById.get(c.id) ?? 0n,
    }));
  }),

  set: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid(), amount: decimal }))
    .mutation(async ({ ctx, input }) => {
      const base = getBaseCurrency();
      const amountMinor = fromDecimal(input.amount, base).amount;
      await ctx.db
        .insert(categoryBudgets)
        .values({
          userId: ctx.user.id,
          categoryId: input.categoryId,
          amountMinor,
          currency: base,
        })
        .onConflictDoUpdate({
          target: [categoryBudgets.userId, categoryBudgets.categoryId],
          set: { amountMinor, currency: base },
        });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(categoryBudgets)
        .where(
          and(
            eq(categoryBudgets.userId, ctx.user.id),
            eq(categoryBudgets.categoryId, input.categoryId),
          ),
        );
      return { ok: true };
    }),
});
