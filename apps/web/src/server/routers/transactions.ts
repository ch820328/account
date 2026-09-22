import { accounts, auditLog, categories, monthConfirmations, transactions, TRANSACTION_TYPES, attachments, ACCOUNT_TYPES } from "@acc/db";
import {
  categoryExpenseTotals,
  incomeExpenseTrend,
  monthCategoryTotals,
  monthlyBreakdown,
  annualBreakdown,
  monthlyHistory,
  upcomingScheduled,
} from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { type SQL, and, asc, desc, eq, gte, ilike, lt, lte, or, inArray, notInArray, ne, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");

const SMART_CATEGORY_RULES = [
  { keywords: ["qburger", "滷味", "麥當勞", "師園", "鹽酥雞", "排骨", "外食", "餐廳", "便當", "八方雲集", "鍋貼", "火鍋", "壽司", "拉麵"], catName: "外食" },
  { keywords: ["黑松", "手搖", "50嵐", "麻古", "飲料", "咖啡", "星巴克", "路易莎"], catName: "飲料" },
  { keywords: ["youtubepremium", "youtube premium", "netflix", "spotify", "disney", "會員"], catName: "會員" },
  { keywords: ["google*overgeared", "overgeared her", "chatgpt", "openai", "claude", "github", "cursor", "icloud", "apple.com/bill", "adobe", "jetbrains"], catName: "軟體" },
  { keywords: ["國外交易手續費", "手續費", "綜所稅", "所得稅", "牌照稅", "房屋稅", "地價稅"], catName: "稅費" },
  { keywords: ["高鐵", "台鐵", "捷運", "悠遊卡", "一卡通", "客運"], catName: "大眾運輸" },
  { keywords: ["優步", "uber", "taxi", "車隊", "計程車"], catName: "計程車" },
  { keywords: ["中油", "台塑", "加油"], catName: "加油" },
  { keywords: ["自來水", "台電", "台灣電力", "天然氣", "瓦斯"], catName: "水電瓦斯" },
  { keywords: ["寬頻", "中華電信", "台灣大哥大", "遠傳", "今網寬頻"], catName: "網路電信" },
  { keywords: ["阿奇立克", "全國電子", "燦坤", "家電", "家具", "ikea"], catName: "家具家電" },
  { keywords: ["coupang", "momo", "蝦皮", "shopee", "pchome", "統康生活", "全聯", "家樂福", "屈臣氏", "康是美", "隆洲實業", "google store"], catName: "生活用品" },
];

export const transactionsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(1000).default(50),
          /**
           * Cursor-based pagination (preferred over offset for large datasets).
           * Pass the `nextCursor` from the previous response to fetch the next page.
           * Encodes the last item's `occurredAt` ISO string and `id`.
           */
          cursor: z
            .object({
              occurredAt: z.string().datetime(),
              id: z.string().uuid(),
            })
            .optional(),
          /** Legacy offset pagination — still supported for backward compat. */
          offset: z.number().int().min(0).default(0),
          type: z.enum(TRANSACTION_TYPES).optional(),
          accountIds: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
          accountTypes: z.array(z.enum(ACCOUNT_TYPES)).optional(),
          excludeAccountTypes: z.array(z.enum(ACCOUNT_TYPES)).optional(),
          categoryId: z.string().uuid().optional(),
          categoryIds: z.array(z.string().uuid()).optional(),
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
      if (input?.categoryIds && input.categoryIds.length > 0) {
        conditions.push(inArray(transactions.categoryId, input.categoryIds));
      } else if (input?.categoryId) {
        conditions.push(eq(transactions.categoryId, input.categoryId));
      }
      if (input?.accountIds) {
        const ids = (Array.isArray(input.accountIds) ? input.accountIds : [input.accountIds]).filter(Boolean);
        if (ids.length > 0) {
          conditions.push(
            or(
              inArray(transactions.accountId, ids),
              inArray(transactions.transferAccountId, ids),
            ),
          );
        } else {
          conditions.push(sql`1=0`);
        }
      }
      if (input?.accountTypes && input.accountTypes.length > 0) {
        conditions.push(inArray(accounts.type, input.accountTypes));
      }
      if (input?.excludeAccountTypes && input.excludeAccountTypes.length > 0) {
        conditions.push(notInArray(accounts.type, input.excludeAccountTypes));
      }
      if (input?.month) {
        const [y, m] = input.month.split("-").map(Number);
        const startOfMonth = new Date(y!, m! - 1, 1);
        const endOfMonth = new Date(y!, m!, 1);
        conditions.push(
          or(
            eq(transactions.statementMonth, input.month),
            and(
              or(isNull(transactions.statementMonth), eq(transactions.statementMonth, "")),
              gte(transactions.occurredAt, startOfMonth),
              lt(transactions.occurredAt, endOfMonth),
            ),
          ),
        );
      }
      if (input?.search) conditions.push(ilike(transactions.note, `%${input.search}%`));

      // Cursor-based keyset pagination: avoids slow OFFSET scans on large tables.
      // WHERE (occurredAt < cursor.occurredAt)
      //    OR (occurredAt = cursor.occurredAt AND id < cursor.id)
      const cursor = input?.cursor;
      if (cursor) {
        const cursorDate = new Date(cursor.occurredAt);
        conditions.push(
          or(
            lt(transactions.occurredAt, cursorDate),
            and(
              lte(transactions.occurredAt, cursorDate),
              lt(transactions.id, cursor.id),
            ),
          ),
        );
      }

      const limit = input?.limit ?? 50;

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
          accountType: accounts.type,
          transferAccountId: transactions.transferAccountId,
          transferAccountName: destAccounts.name,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          isPaid: transactions.isPaid,
          statementMonth: transactions.statementMonth,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(destAccounts, eq(transactions.transferAccountId, destAccounts.id))
        .where(and(...conditions))
        .orderBy(desc(transactions.occurredAt))
        .limit(limit + 1)
        // Offset only used when cursor is not provided (legacy compat)
        .offset(cursor ? 0 : (input?.offset ?? 0));

      let nextCursor: typeof cursor = undefined;
      if (rows.length > limit) {
        const nextItem = rows.pop()!;
        nextCursor = {
          occurredAt: nextItem.occurredAt.toISOString(),
          id: nextItem.id,
        };
      }

      // Batch load attachments for the transactions
      const txIds = rows.map((r) => r.id);
      let attachmentsMap = new Map<string, { id: string; filename: string; contentType: string; sizeBytes: number }[]>();
      if (txIds.length > 0) {
        const attRows = await ctx.db
          .select({
            id: attachments.id,
            transactionId: attachments.transactionId,
            filename: attachments.filename,
            contentType: attachments.contentType,
            sizeBytes: attachments.sizeBytes,
          })
          .from(attachments)
          .where(and(eq(attachments.userId, ctx.user.id), inArray(attachments.transactionId, txIds)));

        for (const att of attRows) {
          if (!att.transactionId) continue;
          if (!attachmentsMap.has(att.transactionId)) {
            attachmentsMap.set(att.transactionId, []);
          }
          attachmentsMap.get(att.transactionId)!.push({
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.sizeBytes,
          });
        }
      }

      const itemsWithAttachments = rows.map((r) => ({
        ...r,
        attachments: attachmentsMap.get(r.id) ?? [],
      }));

      return { items: itemsWithAttachments, nextCursor, hasMore: Boolean(nextCursor) };
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
          transferAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
          statementMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
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

      let destAccount: typeof acct | undefined = undefined;

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
        destAccount = dest;
      }

      const currency = (input.currency ?? acct.currency).toUpperCase();
      const { amount } = fromDecimal(input.amount, currency);

      let transferAmountMinor: bigint | undefined = undefined;
      if (input.type === "transfer" && destAccount) {
        if (input.transferAmount) {
          transferAmountMinor = fromDecimal(input.transferAmount, destAccount.currency).amount;
        } else if (currency !== destAccount.currency) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `轉出帳戶幣別 (${currency}) 與轉入帳戶幣別 (${destAccount.currency}) 不同，請明確輸入入帳金額`,
          });
        } else {
          // Same currency fallback to exact source amount
          transferAmountMinor = amount;
        }
      }

      const [created] = await ctx.db
        .insert(transactions)
        .values({
          userId: ctx.user.id,
          accountId: input.accountId,
          transferAccountId: input.type === "transfer" ? input.transferAccountId : undefined,
          categoryId: input.type === "transfer" ? undefined : input.categoryId,
          type: input.type,
          amountMinor: amount,
          transferAmountMinor: transferAmountMinor,
          currency,
          occurredAt: input.occurredAt ?? new Date(),
          note: input.note,
          statementMonth: input.statementMonth ?? null,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: decimal.optional(),
        accountId: z.string().uuid().optional(),
        transferAccountId: z.string().uuid().nullable().optional(),
        categoryId: z.string().uuid().nullable().optional(),
        occurredAt: z.date().optional(),
        note: z.string().max(500).nullable().optional(),
        statementMonth: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到交易" });

      if (input.accountId && input.accountId !== existing.accountId) {
        const [acct] = await ctx.db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
          .limit(1);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的帳戶" });
      }

      if (input.transferAccountId && input.transferAccountId !== existing.transferAccountId) {
        const [dest] = await ctx.db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.id, input.transferAccountId), eq(accounts.userId, ctx.user.id)))
          .limit(1);
        if (!dest) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的入帳帳戶" });
      }

      if (input.categoryId && input.categoryId !== existing.categoryId) {
        const [cat] = await ctx.db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, input.categoryId), eq(categories.userId, ctx.user.id)))
          .limit(1);
        if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的分類" });
      }

      const amountMinor = input.amount
        ? fromDecimal(input.amount, existing.currency).amount
        : existing.amountMinor;

      const [updated] = await ctx.db
        .update(transactions)
        .set({
          amountMinor,
          accountId: input.accountId ?? existing.accountId,
          transferAccountId:
            input.transferAccountId !== undefined
              ? input.transferAccountId
              : existing.transferAccountId,
          categoryId:
            input.categoryId !== undefined
              ? existing.type === "transfer"
                ? null
                : input.categoryId
              : existing.categoryId,
          occurredAt: input.occurredAt ?? existing.occurredAt,
          note: input.note !== undefined ? input.note : existing.note,
          statementMonth:
            input.statementMonth !== undefined ? input.statementMonth : existing.statementMonth,
        })
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
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

      const amount = Math.round(Number(deleted.amountMinor) / 100).toLocaleString();
      await ctx.db.insert(auditLog).values({
        userId: ctx.user.id,
        action: "delete",
        entity: "transaction",
        summary: `${deleted.type} ${amount} ${deleted.currency}${deleted.note ? ` · ${deleted.note}` : ""}`,
      });
      return deleted;
    }),

  setPaid: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isPaid: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(transactions)
        .set({ isPaid: input.isPaid })
        .where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到交易" });
      return updated;
    }),

  unpaidCreditCard: protectedProcedure.query(async ({ ctx }) => {
    const destAccounts = ctx.db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .as("dest_accounts");

    return ctx.db
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
        accountType: accounts.type,
        billingDay: accounts.billingDay,
        transferAccountId: transactions.transferAccountId,
        transferAccountName: destAccounts.name,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        isPaid: transactions.isPaid,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(destAccounts, eq(transactions.transferAccountId, destAccounts.id))
      .where(
        and(
          eq(transactions.userId, ctx.user.id),
          eq(accounts.type, "credit"),
          eq(transactions.isPaid, false),
        ),
      )
      .orderBy(desc(transactions.occurredAt));
  }),

  monthlyBreakdown: protectedProcedure
    .input(
      z
        .object({
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          baseCurrency: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return monthlyBreakdown(ctx.db, ctx.user.id, input?.month, input?.baseCurrency);
    }),

  annualBreakdown: protectedProcedure
    .input(
      z
        .object({
          year: z.number().int().min(2000).max(2100).optional(),
          baseCurrency: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return annualBreakdown(ctx.db, ctx.user.id, input?.year, input?.baseCurrency);
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
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const scheduled = await upcomingScheduled(ctx.db, ctx.user.id, input?.days ?? 30);

      const now = new Date();
      const startObj = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      const endObj = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

      const pastAutomated = await ctx.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            or(
              eq(transactions.source, "recurring"),
              eq(transactions.source, "installment"),
              eq(transactions.source, "loan"),
              eq(transactions.source, "payroll")
            ),
            gte(transactions.occurredAt, startObj),
            lte(transactions.occurredAt, endObj)
          )
        );

      const paidItems = pastAutomated.map((t) => {
        const d = t.occurredAt instanceof Date ? t.occurredAt : new Date(t.occurredAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const localDateStr = `${y}-${m}-${day}`;

        return {
          date: localDateStr,
          name: t.note || "自動記錄",
          kind: t.type,
          amountMinor: t.amountMinor,
          currency: t.currency,
          sourceAccountId: t.accountId,
          transferAccountId: t.transferAccountId || undefined,
          categoryId: t.categoryId || undefined,
          ruleId: t.recurringRuleId || undefined,
          paid: true,
        };
      });

      const filteredScheduled = scheduled.filter((s) => {
        const sMonth = s.date.slice(0, 7);
        const hasPaid = paidItems.some((p) => {
          const pMonth = p.date.slice(0, 7);
          return pMonth === sMonth && (p.ruleId === s.ruleId || p.name === s.name);
        });
        return !hasPaid;
      });

      const allItems = [...filteredScheduled, ...paidItems];
      allItems.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return allItems;
    }),

  monthCategories: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        baseCurrency: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return monthCategoryTotals(ctx.db, ctx.user.id, input.month, input.baseCurrency);
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

  getMonthConfirmations: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(monthConfirmations)
      .where(eq(monthConfirmations.userId, ctx.user.id));
  }),

  toggleMonthConfirmation: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        confirmed: z.boolean(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(monthConfirmations)
        .where(
          and(
            eq(monthConfirmations.userId, ctx.user.id),
            eq(monthConfirmations.month, input.month),
          ),
        );

      if (existing) {
        const [updated] = await ctx.db
          .update(monthConfirmations)
          .set({
            confirmed: input.confirmed,
            confirmedAt: new Date(),
            note: input.note ?? existing.note,
          })
          .where(
            and(
              eq(monthConfirmations.userId, ctx.user.id),
              eq(monthConfirmations.month, input.month),
            ),
          )
          .returning();
        return updated;
      } else {
        const [inserted] = await ctx.db
          .insert(monthConfirmations)
          .values({
            userId: ctx.user.id,
            month: input.month,
            confirmed: input.confirmed,
            confirmedAt: new Date(),
            note: input.note,
          })
          .returning();
        return inserted;
      }
    }),

  getInitialMonth: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const records = await ctx.db
      .select()
      .from(monthConfirmations)
      .where(eq(monthConfirmations.userId, ctx.user.id));

    const confirmedSet = new Set(records.filter((r) => r.confirmed).map((r) => r.month));

    const [firstTx] = await ctx.db
      .select({ occurredAt: transactions.occurredAt })
      .from(transactions)
      .where(eq(transactions.userId, ctx.user.id))
      .orderBy(asc(transactions.occurredAt))
      .limit(1);

    let startMonth = currentMonth;
    if (firstTx?.occurredAt) {
      const d = new Date(firstTx.occurredAt);
      startMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    const twelveMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const twelveMonthsAgoStr = `${twelveMonthsAgoDate.getFullYear()}-${String(twelveMonthsAgoDate.getMonth() + 1).padStart(2, "0")}`;
    if (startMonth < twelveMonthsAgoStr) {
      startMonth = twelveMonthsAgoStr;
    }

    const monthsToCheck: string[] = [];
    const startParts = startMonth.split("-").map(Number);
    const currParts = currentMonth.split("-").map(Number);
    let y = startParts[0] ?? 2026;
    let m = startParts[1] ?? 1;
    const currY = currParts[0] ?? 2026;
    const currM = currParts[1] ?? 1;

    while (y < currY || (y === currY && m <= currM)) {
      const mStr = `${y}-${String(m).padStart(2, "0")}`;
      monthsToCheck.push(mStr);
      m++;
      if (m > 12) {
        m = 1;
        y = y + 1;
      }
    }

    const unconfirmedMonths: string[] = [];
    for (const mStr of monthsToCheck) {
      if (mStr < currentMonth && !confirmedSet.has(mStr)) {
        unconfirmedMonths.push(mStr);
      }
    }

    const initialMonth = unconfirmedMonths.length > 0 ? unconfirmedMonths[0] : currentMonth;

    return {
      initialMonth,
      currentMonth,
      unconfirmedMonths,
      confirmedMonths: Array.from(confirmedSet),
    };
  }),

  importCsv: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        transactions: z.array(
          z.object({
            occurredAt: z.string(),
            amountMinor: z.string(),
            type: z.enum(["income", "expense", "transfer"]).default("expense"),
            note: z.string().default(""),
            currency: z.string().default("TWD"),
            statementMonth: z.string().optional().nullable(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到指定的帳戶" });

      if (input.transactions.length === 0) {
        return { importedCount: 0, skippedCount: 0, totalCount: 0 };
      }

      // Query existing transactions for deduplication
      const dates = input.transactions.map((t) => new Date(t.occurredAt));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      const queryStart = new Date(minDate.getTime() - 2 * 86400 * 1000);
      const queryEnd = new Date(maxDate.getTime() + 2 * 86400 * 1000);

      const existingTxs = await ctx.db
        .select({
          id: transactions.id,
          occurredAt: transactions.occurredAt,
          amountMinor: transactions.amountMinor,
          note: transactions.note,
          categoryId: transactions.categoryId,
          statementMonth: transactions.statementMonth,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.accountId, input.accountId),
            gte(transactions.occurredAt, queryStart),
            lte(transactions.occurredAt, queryEnd)
          )
        );

      const normalizeNoteForDedup = (note: string | null | undefined): string => {
        if (!note) return "";
        return note
          .normalize("NFKC")
          .replace(/\s*\(\d{4}\)$/, "") // strip trailing card last 4 digits e.g. (9441)
          .replace(/\s+/g, " ")         // compress multiple spaces/tabs
          .trim()
          .toLowerCase();
      };

      const isPlaceholderNote = (n: string | null | undefined): boolean => {
        if (!n) return false;
        const cleaned = n.replace(/\s*\(\d{4}\)$/, "").trim();
        return /^(生活消費|連鎖商店消費|美食外食|百貨公司消費|一般消費|餐飲消費|交通運輸)/.test(cleaned);
      };

      const extractCardDigits = (n: string | null | undefined): string | null => {
        if (!n) return null;
        const match = n.match(/\((\d{4})\)$/);
        return match?.[1] ?? null;
      };

      // Group existing transactions by `${dStr}_${amountMinor}`
      const existingByDateAmount = new Map<string, typeof existingTxs>();
      for (const ex of existingTxs) {
        const dStr = ex.occurredAt.toISOString().slice(0, 10);
        const groupKey = `${dStr}_${ex.amountMinor.toString()}`;
        const list = existingByDateAmount.get(groupKey) ?? [];
        list.push(ex);
        existingByDateAmount.set(groupKey, list);
      }

      // Track consumed existing transaction IDs in this import batch
      const consumedExistingIds = new Set<string>();

      const toInsert: (typeof transactions.$inferInsert)[] = [];
      const toUpdate: { id: string; note: string; categoryId: string | null; statementMonth: string | null }[] = [];
      let skippedCount = 0;
      let updatedCount = 0;

      // Fetch user categories for smart automatic categorization
      const userCategories = await ctx.db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, ctx.user.id));
      const catNameToId = new Map(userCategories.map((c) => [c.name, c.id]));

      const matchCategory = (rawNote: string): string | null => {
        const noteNorm = rawNote.normalize("NFKC").toLowerCase();
        const rule = SMART_CATEGORY_RULES.find((r) =>
          r.keywords.some((k) => noteNorm.includes(k.toLowerCase())),
        );
        if (rule && catNameToId.has(rule.catName)) {
          return catNameToId.get(rule.catName)!;
        }
        return null;
      };

      for (const t of input.transactions) {
        const d = new Date(t.occurredAt);
        const dStr = d.toISOString().slice(0, 10);
        const amountMinor = BigInt(t.amountMinor);
        const amountStr = amountMinor.toString();
        const noteTrimmed = t.note.trim();
        const groupKey = `${dStr}_${amountStr}`;

        const candidates = (existingByDateAmount.get(groupKey) ?? []).filter(
          (c) => !consumedExistingIds.has(c.id)
        );

        let matchedCandidate: (typeof existingTxs)[0] | null = null;
        const newCard = extractCardDigits(noteTrimmed);
        const normNew = normalizeNoteForDedup(noteTrimmed);

        // 1. Try exact note match (with or without card digits)
        for (const c of candidates) {
          const cCard = extractCardDigits(c.note);
          if (newCard && cCard && newCard !== cCard) continue; // different card number

          const normC = normalizeNoteForDedup(c.note);
          if (normC === normNew) {
            matchedCandidate = c;
            break;
          }
        }

        // 2. Try placeholder / descriptive evolution match
        if (!matchedCandidate) {
          for (const c of candidates) {
            const cCard = extractCardDigits(c.note);
            if (newCard && cCard && newCard !== cCard) continue;

            const normC = normalizeNoteForDedup(c.note);
            const cIsPlaceholder = isPlaceholderNote(c.note);
            const newIsPlaceholder = isPlaceholderNote(noteTrimmed);

            // One is generic placeholder and one is specific, or one is substring of other
            if (
              (cIsPlaceholder && !newIsPlaceholder) ||
              (!cIsPlaceholder && newIsPlaceholder) ||
              (normC && normNew && (normC.includes(normNew) || normNew.includes(normC)))
            ) {
              matchedCandidate = c;
              break;
            }
          }
        }

        if (matchedCandidate) {
          consumedExistingIds.add(matchedCandidate.id);

          // If the new note is more specific than a placeholder, update the existing record
          if (isPlaceholderNote(matchedCandidate.note) && !isPlaceholderNote(noteTrimmed)) {
            const newCatId = matchCategory(noteTrimmed) ?? matchedCandidate.categoryId;
            toUpdate.push({
              id: matchedCandidate.id,
              note: noteTrimmed,
              categoryId: newCatId,
              statementMonth: matchedCandidate.statementMonth ?? (t as { statementMonth?: string | null }).statementMonth ?? null,
            });
            updatedCount++;
          } else {
            skippedCount++;
          }
          continue;
        }

        // No candidate matched -> insert as new transaction
        toInsert.push({
          userId: ctx.user.id,
          accountId: input.accountId,
          categoryId: matchCategory(noteTrimmed),
          type: t.type,
          amountMinor,
          currency: t.currency || acct.currency,
          occurredAt: d,
          note: noteTrimmed || null,
          source: "manual",
          statementMonth: (t as { statementMonth?: string | null }).statementMonth ?? null,
        });
      }

      if (toUpdate.length > 0) {
        for (const u of toUpdate) {
          await ctx.db
            .update(transactions)
            .set({
              note: u.note,
              categoryId: u.categoryId,
              statementMonth: u.statementMonth,
            })
            .where(eq(transactions.id, u.id));
        }
      }

      if (toInsert.length > 0) {
        await ctx.db.transaction(async (tx) => {
          await tx.insert(transactions).values(toInsert);
        });
      }

      return {
        importedCount: toInsert.length,
        updatedCount,
        skippedCount: skippedCount + updatedCount,
        totalCount: input.transactions.length,
      };
    }),
});
