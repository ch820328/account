import { LOAN_LEDGER_KINDS, forecastSettings, loanLedgerEntries, transactions } from "@acc/db";
import { signedLedgerAmount, updateForecastSettings } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const personalLoansRouter = router({
  /** Summary grouped by counterparty with net running balance. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(loanLedgerEntries)
      .where(eq(loanLedgerEntries.userId, ctx.user.id))
      .orderBy(asc(loanLedgerEntries.occurredAt));

    const byPerson = new Map<
      string,
      {
        counterparty: string;
        currency: string;
        netMinor: bigint;
        entryCount: number;
        lastDate: string;
      }
    >();

    for (const r of rows) {
      const existing = byPerson.get(r.counterparty);
      const signed = signedLedgerAmount(r.kind, r.amountMinor);
      if (existing) {
        existing.netMinor += signed;
        existing.entryCount += 1;
        if (r.occurredAt > existing.lastDate) existing.lastDate = r.occurredAt;
      } else {
        byPerson.set(r.counterparty, {
          counterparty: r.counterparty,
          currency: r.currency,
          netMinor: signed,
          entryCount: 1,
          lastDate: r.occurredAt,
        });
      }
    }

    return [...byPerson.values()].sort((a, b) => a.counterparty.localeCompare(b.counterparty));
  }),

  entries: protectedProcedure
    .input(z.object({ counterparty: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(loanLedgerEntries)
        .where(
          and(
            eq(loanLedgerEntries.userId, ctx.user.id),
            eq(loanLedgerEntries.counterparty, input.counterparty),
          ),
        )
        .orderBy(desc(loanLedgerEntries.occurredAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        counterparty: z.string().min(1).max(80),
        kind: z.enum(LOAN_LEDGER_KINDS),
        amount: decimal,
        currency: z.string().length(3).default("TWD"),
        occurredAt: isoDate,
        note: z.string().max(500).optional(),
        accountId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currency = input.currency.toUpperCase();
      const amountMinor = fromDecimal(input.amount, currency).amount;

      let transactionId: string | undefined = undefined;

      if (input.accountId) {
        // Create transaction linked to the account
        const type = (input.kind === "lend" || input.kind === "repay") ? "expense" : "income";
        
        const [tx] = await ctx.db
          .insert(transactions)
          .values({
            userId: ctx.user.id,
            accountId: input.accountId,
            type,
            amountMinor,
            currency,
            occurredAt: new Date(input.occurredAt),
            note: input.note || `借款紀錄 - ${input.counterparty}`,
            source: "loan",
          })
          .returning({ id: transactions.id });
        
        transactionId = tx?.id;
      }

      const [created] = await ctx.db
        .insert(loanLedgerEntries)
        .values({
          userId: ctx.user.id,
          counterparty: input.counterparty.trim(),
          kind: input.kind,
          amountMinor,
          currency,
          occurredAt: input.occurredAt,
          note: input.note,
          transactionId,
        })
        .returning();
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        counterparty: z.string().min(1).max(80),
        kind: z.enum(LOAN_LEDGER_KINDS),
        amount: decimal,
        currency: z.string().length(3).default("TWD"),
        occurredAt: isoDate,
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currency = input.currency.toUpperCase();
      const amountMinor = fromDecimal(input.amount, currency).amount;

      const [existing] = await ctx.db
        .select()
        .from(loanLedgerEntries)
        .where(
          and(eq(loanLedgerEntries.id, input.id), eq(loanLedgerEntries.userId, ctx.user.id)),
        );

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到紀錄" });

      const [updated] = await ctx.db
        .update(loanLedgerEntries)
        .set({
          counterparty: input.counterparty.trim(),
          kind: input.kind,
          amountMinor,
          currency,
          occurredAt: input.occurredAt,
          note: input.note ?? null,
        })
        .where(eq(loanLedgerEntries.id, input.id))
        .returning();

      if (existing.transactionId) {
        const type = (input.kind === "lend" || input.kind === "repay") ? "expense" : "income";
        await ctx.db
          .update(transactions)
          .set({
            amountMinor,
            currency,
            occurredAt: new Date(input.occurredAt),
            note: input.note || `借款紀錄 - ${input.counterparty}`,
            type,
          })
          .where(eq(transactions.id, existing.transactionId));
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(loanLedgerEntries)
        .where(
          and(eq(loanLedgerEntries.id, input.id), eq(loanLedgerEntries.userId, ctx.user.id)),
        )
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到紀錄" });

      if (deleted.transactionId) {
        await ctx.db
          .delete(transactions)
          .where(and(eq(transactions.id, deleted.transactionId), eq(transactions.userId, ctx.user.id)));
      }

      return deleted;
    }),

  /** Whether the lending ledger is folded into net worth (receivable/payable). */
  netWorthSetting: protectedProcedure.query(async ({ ctx }) => {
    const [s] = await ctx.db
      .select({ include: forecastSettings.includeLendingInNetWorth })
      .from(forecastSettings)
      .where(eq(forecastSettings.userId, ctx.user.id))
      .limit(1);
    return { includeInNetWorth: s?.include ?? false };
  }),

  setNetWorthSetting: protectedProcedure
    .input(z.object({ include: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateForecastSettings(ctx.db, ctx.user.id, {
        includeLendingInNetWorth: input.include,
      });
      return { includeInNetWorth: input.include };
    }),
});
