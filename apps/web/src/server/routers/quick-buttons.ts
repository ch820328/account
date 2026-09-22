import { quickButtons, transactions, categories, accounts } from "@acc/db";
import { TRPCError } from "@trpc/server";
import { and, eq, asc, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { fromDecimal } from "@acc/money";

function getMonthBounds(monthStr?: string): { start: Date; end: Date; monthKey: string } {
  let y: number;
  let m: number;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const parts = monthStr.split("-");
    y = parseInt(parts[0]!, 10);
    m = parseInt(parts[1]!, 10);
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
  const monthKey = `${y}-${String(m).padStart(2, "0")}`;
  return { start, end, monthKey };
}

export const quickButtonsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { start, end, monthKey } = getMonthBounds(input?.month);

      // 1. Fetch user's quick buttons
      const buttons = await ctx.db
        .select({
          id: quickButtons.id,
          name: quickButtons.name,
          icon: quickButtons.icon,
          type: quickButtons.type,
          categoryId: quickButtons.categoryId,
          categoryName: categories.name,
          accountId: quickButtons.accountId,
          accountName: accounts.name,
          defaultAmountMinor: quickButtons.defaultAmountMinor,
          matchPattern: quickButtons.matchPattern,
          sortOrder: quickButtons.sortOrder,
          createdAt: quickButtons.createdAt,
        })
        .from(quickButtons)
        .leftJoin(categories, eq(quickButtons.categoryId, categories.id))
        .leftJoin(accounts, eq(quickButtons.accountId, accounts.id))
        .where(eq(quickButtons.userId, ctx.user.id))
        .orderBy(asc(quickButtons.sortOrder), asc(quickButtons.createdAt));

      // 2. Fetch all transactions for this user in the target month
      const monthTxList = await ctx.db
        .select({
          id: transactions.id,
          type: transactions.type,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            gte(transactions.occurredAt, start),
            lt(transactions.occurredAt, end)
          )
        );

      // 3. Match each button against month's transactions
      return buttons.map((btn) => {
        const pattern = (btn.matchPattern || btn.name || "").trim().toLowerCase();
        
        // Find matching transaction in month
        const matched = monthTxList.find((tx) => {
          // If transaction types don't match, skip
          if (tx.type !== btn.type) return false;

          // Note keyword match
          const noteLower = (tx.note || "").toLowerCase();
          if (pattern && noteLower.includes(pattern)) return true;

          // Category match if category is specified
          if (btn.categoryId && tx.categoryId === btn.categoryId) {
            // If pattern is also given, prefer matching note keyword or check if note is empty
            if (pattern) {
              return noteLower.includes(pattern) || noteLower.length === 0;
            }
            return true;
          }

          return false;
        });

        return {
          ...btn,
          monthKey,
          isRecorded: !!matched,
          recordedTx: matched
            ? {
                id: matched.id,
                amountMinor: matched.amountMinor,
                currency: matched.currency,
                occurredAt: matched.occurredAt,
                note: matched.note,
              }
            : null,
        };
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "請輸入按鈕名稱"),
        icon: z.string().optional().default("⚡"),
        type: z.enum(["expense", "income", "transfer"]).default("expense"),
        categoryId: z.string().uuid().nullable().optional(),
        accountId: z.string().uuid().nullable().optional(),
        defaultAmount: z.string().optional(),
        matchPattern: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let defaultAmountMinor: bigint | null = null;
      if (input.defaultAmount && input.defaultAmount.trim() !== "") {
        try {
          defaultAmountMinor = fromDecimal(input.defaultAmount.trim(), "TWD").amount;
        } catch {
          defaultAmountMinor = null;
        }
      }

      // Find max sort order
      const existing = await ctx.db
        .select({ sortOrder: quickButtons.sortOrder })
        .from(quickButtons)
        .where(eq(quickButtons.userId, ctx.user.id));
      const nextSort = existing.reduce((max, b) => Math.max(max, b.sortOrder), 0) + 1;

      const [created] = await ctx.db
        .insert(quickButtons)
        .values({
          userId: ctx.user.id,
          name: input.name.trim(),
          icon: input.icon?.trim() || "⚡",
          type: input.type,
          categoryId: input.categoryId || null,
          accountId: input.accountId || null,
          defaultAmountMinor,
          matchPattern: input.matchPattern?.trim() || input.name.trim(),
          sortOrder: nextSort,
        })
        .returning();

      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1, "請輸入按鈕名稱"),
        icon: z.string().optional(),
        type: z.enum(["expense", "income", "transfer"]).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        accountId: z.string().uuid().nullable().optional(),
        defaultAmount: z.string().nullable().optional(),
        matchPattern: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(quickButtons)
        .where(and(eq(quickButtons.id, input.id), eq(quickButtons.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到快捷按鈕" });

      let defaultAmountMinor = existing.defaultAmountMinor;
      if (input.defaultAmount !== undefined) {
        if (!input.defaultAmount || input.defaultAmount.trim() === "") {
          defaultAmountMinor = null;
        } else {
          try {
            defaultAmountMinor = fromDecimal(input.defaultAmount.trim(), "TWD").amount;
          } catch {
            defaultAmountMinor = null;
          }
        }
      }

      const [updated] = await ctx.db
        .update(quickButtons)
        .set({
          name: input.name.trim(),
          icon: input.icon !== undefined ? input.icon.trim() : existing.icon,
          type: input.type ?? existing.type,
          categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
          accountId: input.accountId !== undefined ? input.accountId : existing.accountId,
          defaultAmountMinor,
          matchPattern:
            input.matchPattern !== undefined
              ? (input.matchPattern?.trim() || input.name.trim())
              : existing.matchPattern,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(and(eq(quickButtons.id, input.id), eq(quickButtons.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(quickButtons)
        .where(and(eq(quickButtons.id, input.id), eq(quickButtons.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到快捷按鈕" });
      return deleted;
    }),
});
