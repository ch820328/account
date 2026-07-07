import { accounts, MARKETS, rsuGrants, rsuVests } from "@acc/db";
import { previewRsuSchedule, rsuVestRows } from "@acc/core";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const quantity = z.string().regex(/^\d+(\.\d+)?$/, "數量格式不正確");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rsuRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const grants = await ctx.db
      .select()
      .from(rsuGrants)
      .where(eq(rsuGrants.userId, ctx.user.id))
      .orderBy(rsuGrants.createdAt);

    if (grants.length === 0) return [];

    const allVests = await ctx.db
      .select()
      .from(rsuVests)
      .where(inArray(rsuVests.grantId, grants.map((g) => g.id)))
      .orderBy(asc(rsuVests.periodIndex));

    const vestsByGrant = new Map<string, typeof allVests>();
    for (const vest of allVests) {
      const list = vestsByGrant.get(vest.grantId);
      if (list) list.push(vest);
      else vestsByGrant.set(vest.grantId, [vest]);
    }

    return grants.map((grant) => {
      const vests = vestsByGrant.get(grant.id) ?? [];
      const vested = vests.filter((v) => v.status === "vested").length;
      const next = vests.find((v) => v.status === "pending");
      return { ...grant, vests, vestedCount: vested, nextVest: next ?? null };
    });
  }),

  preview: protectedProcedure
    .input(
      z.object({
        totalQuantity: quantity,
        startDate: isoDate,
        periods: z.number().int().min(1).max(120).default(48),
      }),
    )
    .query(({ input }) => previewRsuSchedule(input.totalQuantity, input.startDate, input.periods)),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        symbol: z.string().min(1).max(20),
        market: z.enum(MARKETS),
        brokerAccountId: z.string().uuid().optional(),
        totalQuantity: quantity,
        startDate: isoDate,
        periods: z.number().int().min(1).max(120).default(48),
        sellToCoverPct: z.number().min(0).max(100).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.brokerAccountId) {
        const [acct] = await ctx.db
          .select()
          .from(accounts)
          .where(
            and(eq(accounts.id, input.brokerAccountId), eq(accounts.userId, ctx.user.id)),
          )
          .limit(1);
        if (!acct) throw new TRPCError({ code: "NOT_FOUND", message: "找不到證券戶" });
      }

      return ctx.db.transaction(async (tx) => {
        const [grant] = await tx
          .insert(rsuGrants)
          .values({
            userId: ctx.user.id,
            name: input.name,
            symbol: input.symbol.toUpperCase(),
            market: input.market,
            brokerAccountId: input.brokerAccountId,
            totalQuantity: input.totalQuantity,
            startDate: input.startDate,
            periods: input.periods,
            sellToCoverPct: String(input.sellToCoverPct),
          })
          .returning();

        await tx
          .insert(rsuVests)
          .values(rsuVestRows(grant!.id, input.totalQuantity, input.startDate, input.periods));

        return grant;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        symbol: z.string().min(1).max(20).optional(),
        market: z.enum(MARKETS).optional(),
        brokerAccountId: z.string().uuid().nullable().optional(),
        totalQuantity: quantity.optional(),
        startDate: isoDate.optional(),
        periods: z.number().int().min(1).max(120).optional(),
        sellToCoverPct: z.number().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(rsuGrants)
        .where(and(eq(rsuGrants.id, input.id), eq(rsuGrants.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });

      const vests = await ctx.db
        .select()
        .from(rsuVests)
        .where(eq(rsuVests.grantId, existing.id));
      const anyVested = vests.some((v) => v.status === "vested");

      const scheduleChanged =
        (input.totalQuantity != null && input.totalQuantity !== existing.totalQuantity) ||
        (input.startDate != null && input.startDate !== existing.startDate) ||
        (input.periods != null && input.periods !== existing.periods);

      if (scheduleChanged && anyVested) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "已有已入帳的期數，無法修改股數／期數／開始月份，請新增新的授予",
        });
      }

      const totalQuantity = input.totalQuantity ?? existing.totalQuantity;
      const startDate = input.startDate ?? existing.startDate;
      const periods = input.periods ?? existing.periods;

      return ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(rsuGrants)
          .set({
            name: input.name ?? existing.name,
            symbol: (input.symbol ?? existing.symbol).toUpperCase(),
            market: input.market ?? existing.market,
            brokerAccountId:
              input.brokerAccountId !== undefined
                ? input.brokerAccountId
                : existing.brokerAccountId,
            totalQuantity,
            startDate,
            periods,
            sellToCoverPct:
              input.sellToCoverPct !== undefined
                ? String(input.sellToCoverPct)
                : existing.sellToCoverPct,
          })
          .where(eq(rsuGrants.id, existing.id))
          .returning();

        if (scheduleChanged) {
          await tx.delete(rsuVests).where(eq(rsuVests.grantId, existing.id));
          await tx
            .insert(rsuVests)
            .values(rsuVestRows(existing.id, totalQuantity, startDate, periods));
        }

        return updated;
      });
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(rsuGrants)
        .set({ active: input.active })
        .where(and(eq(rsuGrants.id, input.id), eq(rsuGrants.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(rsuGrants)
        .where(and(eq(rsuGrants.id, input.id), eq(rsuGrants.userId, ctx.user.id)))
        .returning();
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });
      return deleted;
    }),
});
