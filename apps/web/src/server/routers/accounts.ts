import { ACCOUNT_TYPES, accounts, auditLog, transactions, installmentSchedules, categories } from "@acc/db";
import { getAccountBalances, getBaseCurrency, latestFxRates, toBaseMinor, fxRateToBase } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const signedDecimal = z.string().regex(/^-?\d+(\.\d+)?$/, "金額格式不正確");

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

const accountSide = z.enum(["asset", "liability"]);

function typeForSide(side: "asset" | "liability", subtype?: string): (typeof ACCOUNT_TYPES)[number] {
  if (side === "liability") {
    if (subtype === "credit") return "credit";
    if (subtype === "mortgage") return "mortgage";
    return "loan";
  }
  if (subtype === "cash") return "cash";
  if (subtype === "broker") return "broker";
  if (subtype === "wallet") return "wallet";
  return "bank";
}

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.archived, false)))
      .orderBy(accounts.createdAt);
  }),

  listWithBalances: protectedProcedure.query(async ({ ctx }) => {
    const base = getBaseCurrency();
    const [rows, rates, meta] = await Promise.all([
      getAccountBalances(ctx.db, ctx.user.id),
      latestFxRates(ctx.db),
      ctx.db
        .select({
          id: accounts.id,
          loanRateAnnual: accounts.loanRateAnnual,
          loanTermMonths: accounts.loanTermMonths,
          loanStartDate: accounts.loanStartDate,
          openingBalanceMinor: accounts.openingBalanceMinor,
          parentId: accounts.parentId,
          bankCode: accounts.bankCode,
          accountNumber: accounts.accountNumber,
          billingDay: accounts.billingDay,
          repaymentDay: accounts.repaymentDay,
          balanceUpdatedAt: accounts.balanceUpdatedAt,
          archived: accounts.archived,
          createdAt: accounts.createdAt,
          cardNumber: accounts.cardNumber,
          cardExpiry: accounts.cardExpiry,
          cardBrand: accounts.cardBrand,
          excludeFromNetWorth: accounts.excludeFromNetWorth,
        })
        .from(accounts)
        .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.archived, false))),
    ]);

    const metaById = new Map(meta.map((m) => [m.id, m]));
    return rows.map((row) => {
      const meta = metaById.get(row.accountId);
      const balanceBaseMinor = toBaseMinor(row.balanceMinor, row.currency, base, rates);
      return {
        ...row,
        ...meta,
        balanceBaseMinor,
        baseCurrency: base,
      };
    });
  }),

  activeFxRates: protectedProcedure.query(async ({ ctx }) => {
    const userAccounts = await ctx.db
      .select({ currency: accounts.currency })
      .from(accounts)
      .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.archived, false)));

    const currencies = Array.from(new Set(userAccounts.map((a) => a.currency.toUpperCase())));
    const base = getBaseCurrency();
    const rates = await latestFxRates(ctx.db);

    const result: { currency: string; rate: number }[] = [];
    for (const cur of currencies) {
      if (cur === base) continue;
      const rateStr = fxRateToBase(cur, base, rates);
      if (rateStr) {
        result.push({
          currency: cur,
          rate: Number(rateStr),
        });
      }
    }
    return {
      base,
      rates: result,
    };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        side: accountSide,
        subtype: z.string().optional(),
        type: z.enum(ACCOUNT_TYPES).optional(),
        currency: z.string().length(3),
        openingBalance: decimal.optional(),
        loanRateAnnual: decimal.optional(),
        loanTermMonths: z.number().int().min(1).max(600).optional(),
        loanStartDate: isoDate,
        parentId: z.string().uuid().optional().nullable(),
        bankCode: z.string().optional().nullable(),
        accountNumber: z.string().optional().nullable(),
        billingDay: z.number().int().min(1).max(31).optional().nullable(),
        repaymentDay: z.number().int().min(1).max(31).optional().nullable(),
        cardNumber: z.string().optional().nullable(),
        cardExpiry: z.string().optional().nullable(),
        cardBrand: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currency = input.currency.toUpperCase();
      const openingBalanceMinor = input.openingBalance
        ? fromDecimal(input.openingBalance, currency).amount
        : 0n;
      const type = input.type ?? typeForSide(input.side, input.subtype);

      const [created] = await ctx.db
        .insert(accounts)
        .values({
          userId: ctx.user.id,
          name: input.name,
          type,
          currency,
          openingBalanceMinor,
          loanRateAnnual: input.loanRateAnnual,
          loanTermMonths: input.loanTermMonths,
          loanStartDate: input.loanStartDate,
          parentId: input.parentId || null,
          bankCode: input.bankCode || null,
          accountNumber: input.accountNumber || null,
          billingDay: input.billingDay || null,
          repaymentDay: input.repaymentDay || null,
          cardNumber: input.cardNumber || null,
          cardExpiry: input.cardExpiry || null,
          cardBrand: input.cardBrand || null,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        openingBalance: decimal.optional(),
        loanRateAnnual: decimal.optional().nullable(),
        loanTermMonths: z.number().int().min(1).max(600).optional().nullable(),
        loanStartDate: isoDate.nullable(),
        parentId: z.string().uuid().optional().nullable(),
        bankCode: z.string().optional().nullable(),
        accountNumber: z.string().optional().nullable(),
        billingDay: z.number().int().min(1).max(31).optional().nullable(),
        repaymentDay: z.number().int().min(1).max(31).optional().nullable(),
        type: z.enum(ACCOUNT_TYPES).optional(),
        cardNumber: z.string().optional().nullable(),
        cardExpiry: z.string().optional().nullable(),
        cardBrand: z.string().optional().nullable(),
        excludeFromNetWorth: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      const openingBalanceMinor =
        input.openingBalance !== undefined
          ? fromDecimal(input.openingBalance, existing.currency).amount
          : existing.openingBalanceMinor;

      const [updated] = await ctx.db
        .update(accounts)
        .set({
          name: input.name ?? existing.name,
          openingBalanceMinor,
          parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
          loanRateAnnual:
            input.loanRateAnnual === undefined
              ? existing.loanRateAnnual
              : input.loanRateAnnual,
          loanTermMonths:
            input.loanTermMonths === undefined ? existing.loanTermMonths : input.loanTermMonths,
          loanStartDate:
            input.loanStartDate === undefined ? existing.loanStartDate : input.loanStartDate,
          bankCode:
            input.bankCode === undefined ? existing.bankCode : input.bankCode,
          accountNumber:
            input.accountNumber === undefined ? existing.accountNumber : input.accountNumber,
          billingDay:
            input.billingDay === undefined ? existing.billingDay : input.billingDay,
          repaymentDay:
            input.repaymentDay === undefined ? existing.repaymentDay : input.repaymentDay,
          type:
            input.type === undefined ? existing.type : input.type,
          balanceUpdatedAt: input.openingBalance !== undefined ? new Date() : undefined,
          cardNumber:
            input.cardNumber === undefined ? existing.cardNumber : input.cardNumber,
          cardExpiry:
            input.cardExpiry === undefined ? existing.cardExpiry : input.cardExpiry,
          cardBrand:
            input.cardBrand === undefined ? existing.cardBrand : input.cardBrand,
          excludeFromNetWorth:
            input.excludeFromNetWorth === undefined ? existing.excludeFromNetWorth : input.excludeFromNetWorth,
        })
        .where(eq(accounts.id, input.id))
        .returning();
      return updated;
    }),

  /** Reconcile: set an account's *current* balance directly (adjusts opening). */
  setBalance: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        balance: signedDecimal,
        prevBalance: signedDecimal.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      const balances = await getAccountBalances(ctx.db, ctx.user.id);
      const current = balances.find((b) => b.accountId === input.id);
      const currentMinor = current?.balanceMinor ?? existing.openingBalanceMinor;

      if (input.prevBalance !== undefined) {
        const expectedMinor = fromDecimal(input.prevBalance, existing.currency).amount;
        if (currentMinor !== expectedMinor) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "對帳衝突：帳戶餘額在此期間已被其他操作變動，請重新整理頁面再試。",
          });
        }
      }

      const targetMinor = fromDecimal(input.balance, existing.currency).amount;

      // Shift the opening balance by the delta so the ledger stays consistent.
      const newOpening = existing.openingBalanceMinor + (targetMinor - currentMinor);

      const [updated] = await ctx.db
        .update(accounts)
        .set({ openingBalanceMinor: newOpening, balanceUpdatedAt: new Date() })
        .where(eq(accounts.id, input.id))
        .returning();
      return updated;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(accounts)
        .set({ archived: true })
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      await ctx.db.insert(auditLog).values({
        userId: ctx.user.id,
        action: "archive",
        entity: "account",
        summary: updated.name,
      });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(accounts)
        .where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到帳戶" });

      await ctx.db.insert(auditLog).values({
        userId: ctx.user.id,
        action: "delete",
        entity: "account",
        summary: deleted.name,
      });
      return deleted;
    }),

  creditCardBilling: protectedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .limit(1);

      if (!acct || acct.type !== "credit") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "非信用卡帳戶" });
      }

      const billingDay = acct.billingDay ?? 10;
      const repaymentDay = acct.repaymentDay ?? 25;

      const schedules = await ctx.db
        .select()
        .from(installmentSchedules)
        .where(and(eq(installmentSchedules.accountId, input.accountId), eq(installmentSchedules.active, true)));

      let remainingInstallmentMinor = 0n;
      for (const s of schedules) {
        const total = s.totalPeriods ?? 0;
        const completed = s.completedPeriods ?? 0;
        if (total > completed) {
          remainingInstallmentMinor += BigInt(total - completed) * s.amountMinor;
        }
      }

      const txs = await ctx.db
        .select({
          id: transactions.id,
          type: transactions.type,
          amountMinor: transactions.amountMinor,
          currency: transactions.currency,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          isPaid: transactions.isPaid,
          statementMonth: transactions.statementMonth,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.accountId, input.accountId),
          ),
        )
        .orderBy(desc(transactions.occurredAt));

      const incomingTransfers = await ctx.db
        .select({
          id: transactions.id,
          amountMinor: transactions.amountMinor,
          transferAmountMinor: transactions.transferAmountMinor,
          occurredAt: transactions.occurredAt,
          note: transactions.note,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, ctx.user.id),
            eq(transactions.transferAccountId, input.accountId),
            eq(transactions.type, "transfer"),
          ),
        )
        .orderBy(desc(transactions.occurredAt));

      let currentOutstandingMinor = acct.openingBalanceMinor;
      for (const t of txs) {
        if (t.type === "transfer") {
          currentOutstandingMinor += t.amountMinor;
        } else if (t.type === "expense") {
          currentOutstandingMinor += t.amountMinor;
        } else if (t.type === "income") {
          currentOutstandingMinor -= t.amountMinor;
        }
      }
      for (const t of incomingTransfers) {
        const amt = t.transferAmountMinor !== null && t.transferAmountMinor !== undefined
          ? t.transferAmountMinor
          : t.amountMinor;
        currentOutstandingMinor -= amt;
      }
      if (currentOutstandingMinor < 0n) currentOutstandingMinor = 0n;

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const todayDate = now.getDate();

      // Find latest closed statement date
      let latestBillingDate: Date;
      if (todayDate >= billingDay) {
        latestBillingDate = new Date(currentYear, currentMonth, billingDay, 23, 59, 59, 999);
      } else {
        latestBillingDate = new Date(currentYear, currentMonth - 1, billingDay, 23, 59, 59, 999);
      }

      // Format statement cycle month key "YYYY-MM"
      const getMonthKey = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      };

      // Unbilled is next cycle
      const unbilledBillingDate = new Date(
        latestBillingDate.getFullYear(),
        latestBillingDate.getMonth() + 1,
        billingDay,
        23, 59, 59, 999
      );
      const unbilledMonthKey = getMonthKey(unbilledBillingDate);
      const currentStatementMonthKey = getMonthKey(latestBillingDate);

      // Previous billing date (cycle start for current statement)
      const previousBillingDate = new Date(
        latestBillingDate.getFullYear(),
        latestBillingDate.getMonth() - 1,
        billingDay,
        23, 59, 59, 999
      );
      const previousStatementMonthKey = getMonthKey(previousBillingDate);

      // Pre-previous billing date (for past statement)
      const prePreviousBillingDate = new Date(
        previousBillingDate.getFullYear(),
        previousBillingDate.getMonth() - 1,
        billingDay,
        23, 59, 59, 999
      );

      const getDueDate = (billingDate: Date) => {
        const y = billingDate.getFullYear();
        const m = billingDate.getMonth();
        if (repaymentDay > billingDay) {
          return new Date(y, m, repaymentDay);
        } else {
          return new Date(y, m + 1, repaymentDay);
        }
      };

      const currentDueDate = getDueDate(latestBillingDate);
      const pastDueDate = getDueDate(previousBillingDate);

      const unbilledTxs: typeof txs = [];
      const currentStatementTxs: typeof txs = [];
      const pastStatementTxs: typeof txs = [];

      let unbilledExpenses = 0n;
      let currentStatementExpenses = 0n;
      let pastStatementExpenses = 0n;

      // Helper to determine which statement cycle month a date belongs to when statementMonth is not explicitly set
      const inferStatementMonth = (d: Date) => {
        const y = d.getFullYear();
        const m = d.getMonth();
        const day = d.getDate();
        if (day <= billingDay) {
          return `${y}-${String(m + 1).padStart(2, "0")}`;
        } else {
          const next = new Date(y, m + 1, 1);
          return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
        }
      };

      for (const t of txs) {
        const d = new Date(t.occurredAt);
        const cycle = t.statementMonth || inferStatementMonth(d);
        const signedAmt = t.type === "expense" ? t.amountMinor : (t.type === "income" ? -t.amountMinor : t.amountMinor);

        if (cycle >= unbilledMonthKey) {
          unbilledTxs.push(t);
          unbilledExpenses += signedAmt;
        } else if (cycle === currentStatementMonthKey) {
          currentStatementTxs.push(t);
          currentStatementExpenses += signedAmt;
        } else {
          pastStatementTxs.push(t);
          pastStatementExpenses += signedAmt;
        }
      }

      if (unbilledExpenses < 0n) unbilledExpenses = 0n;
      if (currentStatementExpenses < 0n) currentStatementExpenses = 0n;
      if (pastStatementExpenses < 0n) pastStatementExpenses = 0n;

      // Portion of current debt belonging to closed statements
      const statementDueMinor = currentOutstandingMinor > unbilledExpenses
        ? currentOutstandingMinor - unbilledExpenses
        : 0n;

      const formatIso = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const unbilledCycleStart = new Date(latestBillingDate);
      unbilledCycleStart.setDate(unbilledCycleStart.getDate() + 1);

      const currentCycleStart = new Date(previousBillingDate);
      currentCycleStart.setDate(currentCycleStart.getDate() + 1);

      const pastCycleStart = new Date(prePreviousBillingDate);
      pastCycleStart.setDate(pastCycleStart.getDate() + 1);

      return {
        billingDay,
        repaymentDay,
        currentOutstandingMinor,
        unbilledMinor: unbilledExpenses,
        installmentRemainingMinor: remainingInstallmentMinor,
        unbilled: {
          cycleStart: formatIso(unbilledCycleStart),
          totalMinor: unbilledExpenses,
          transactions: unbilledTxs,
        },
        currentStatement: {
          statementName: `${latestBillingDate.getFullYear()}/${String(latestBillingDate.getMonth() + 1).padStart(2, "0")} 號帳單`,
          cycleStart: formatIso(currentCycleStart),
          cycleEnd: formatIso(latestBillingDate),
          dueDate: formatIso(currentDueDate),
          totalMinor: currentStatementExpenses,
          dueMinor: statementDueMinor,
          isSettled: statementDueMinor === 0n,
          transactions: currentStatementTxs,
        },
        pastStatements: [
          {
            statementName: `${previousBillingDate.getFullYear()}/${String(previousBillingDate.getMonth() + 1).padStart(2, "0")} 號帳單`,
            cycleStart: formatIso(pastCycleStart),
            cycleEnd: formatIso(previousBillingDate),
            dueDate: formatIso(pastDueDate),
            totalMinor: pastStatementExpenses,
            transactions: pastStatementTxs,
          },
        ],
      };
    }),
});
