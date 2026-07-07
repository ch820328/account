import {
  accounts,
  payrollLines,
  payrollProfiles,
  PAYROLL_LINE_KINDS,
} from "@acc/db";
import { firstPayrollRunDate, sumPayrollLines } from "@acc/core";
import { fromDecimal } from "@acc/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "金額格式不正確");
const lineInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(PAYROLL_LINE_KINDS),
  amount: decimal,
  categoryId: z.string().uuid().optional(),
});

export const payrollRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profiles = await ctx.db
      .select()
      .from(payrollProfiles)
      .where(eq(payrollProfiles.userId, ctx.user.id))
      .orderBy(payrollProfiles.createdAt);

    if (profiles.length === 0) return [];

    const allLines = await ctx.db
      .select()
      .from(payrollLines)
      .where(inArray(payrollLines.profileId, profiles.map((p) => p.id)))
      .orderBy(asc(payrollLines.sortOrder));

    const linesByProfile = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const list = linesByProfile.get(line.profileId);
      if (list) list.push(line);
      else linesByProfile.set(line.profileId, [line]);
    }

    return profiles.map((profile) => {
      const lines = linesByProfile.get(profile.id) ?? [];
      return { ...profile, lines, totals: sumPayrollLines(lines) };
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80).default("月薪"),
        depositAccountId: z.string().uuid(),
        currency: z.string().length(3).optional(),
        dayOfMonth: z.number().int().min(1).max(31).default(25),
        lines: z.array(lineInput).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [acct] = await ctx.db
        .select()
        .from(accounts)
        .where(
          and(eq(accounts.id, input.depositAccountId), eq(accounts.userId, ctx.user.id)),
        )
        .limit(1);
      if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到入帳帳戶" });

      const currency = (input.currency ?? acct.currency).toUpperCase();
      const nextRunDate = firstPayrollRunDate(input.dayOfMonth);

      return ctx.db.transaction(async (tx) => {
        const [profile] = await tx
          .insert(payrollProfiles)
          .values({
            userId: ctx.user.id,
            name: input.name,
            depositAccountId: input.depositAccountId,
            currency,
            dayOfMonth: input.dayOfMonth,
            nextRunDate,
          })
          .returning();

        await tx.insert(payrollLines).values(
          input.lines.map((line, i) => ({
            profileId: profile!.id,
            name: line.name,
            kind: line.kind,
            amountMinor: fromDecimal(line.amount, currency).amount,
            sortOrder: i,
            categoryId: line.categoryId,
          })),
        );

        return profile;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        depositAccountId: z.string().uuid().optional(),
        dayOfMonth: z.number().int().min(1).max(31).optional(),
        lines: z.array(lineInput).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(payrollProfiles)
        .where(and(eq(payrollProfiles.id, input.id), eq(payrollProfiles.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到薪資單" });

      const dayOfMonth = input.dayOfMonth ?? existing.dayOfMonth;
      const nextRunDate =
        input.dayOfMonth != null ? firstPayrollRunDate(dayOfMonth) : existing.nextRunDate;

      return ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(payrollProfiles)
          .set({
            name: input.name ?? existing.name,
            depositAccountId: input.depositAccountId ?? existing.depositAccountId,
            dayOfMonth,
            nextRunDate,
          })
          .where(eq(payrollProfiles.id, input.id))
          .returning();

        if (input.lines) {
          await tx.delete(payrollLines).where(eq(payrollLines.profileId, input.id));
          await tx.insert(payrollLines).values(
            input.lines.map((line, i) => ({
              profileId: input.id,
              name: line.name,
              kind: line.kind,
              amountMinor: fromDecimal(line.amount, existing.currency).amount,
              sortOrder: i,
              categoryId: line.categoryId,
            })),
          );
        }

        return updated;
      });
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(payrollProfiles)
        .set({ active: input.active })
        .where(and(eq(payrollProfiles.id, input.id), eq(payrollProfiles.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到薪資單" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(payrollProfiles)
        .where(and(eq(payrollProfiles.id, input.id), eq(payrollProfiles.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到薪資單" });
      return deleted;
    }),
});
