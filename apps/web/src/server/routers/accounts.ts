import { ACCOUNT_TYPES, accounts } from "@acc/db";
import { getAccountBalances } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

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
    const rows = await getAccountBalances(ctx.db, ctx.user.id);
    const meta = await ctx.db
      .select({
        id: accounts.id,
        loanRateAnnual: accounts.loanRateAnnual,
        loanTermMonths: accounts.loanTermMonths,
        loanStartDate: accounts.loanStartDate,
        openingBalanceMinor: accounts.openingBalanceMinor,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.archived, false)));

    const metaById = new Map(meta.map((m) => [m.id, m]));
    return rows.map((row) => ({
      ...row,
      ...metaById.get(row.accountId),
    }));
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
          loanRateAnnual:
            input.loanRateAnnual === undefined
              ? existing.loanRateAnnual
              : input.loanRateAnnual,
          loanTermMonths:
            input.loanTermMonths === undefined ? existing.loanTermMonths : input.loanTermMonths,
          loanStartDate:
            input.loanStartDate === undefined ? existing.loanStartDate : input.loanStartDate,
        })
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
      return updated;
    }),
});
