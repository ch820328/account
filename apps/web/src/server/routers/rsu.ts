import { accounts, holdings, instruments, priceSnapshots, rsuGrants, rsuVests, rsuSells, transactions, MARKETS } from "@acc/db";
import { previewRsuSchedule, rsuVestRows, findOrCreateInstrument, netVestQuantity, recalculateRsuHoldings } from "@acc/core";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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

    const sells = allVests.length > 0 ? await ctx.db
      .select()
      .from(rsuSells)
      .where(inArray(rsuSells.vestId, allVests.map((v) => v.id))) : [];

    const sellsByVest = new Map<string, typeof sells>();
    for (const s of sells) {
      const list = sellsByVest.get(s.vestId) ?? [];
      list.push(s);
      sellsByVest.set(s.vestId, list);
    }

    const symbolMarkets = grants.map((g) => `${g.symbol}_${g.market}`);
    const uniquePairs = Array.from(new Set(symbolMarkets)).map((pair) => {
      const [symbol, market] = pair.split("_");
      return { symbol: symbol!, market: market as "TW" | "US" };
    });

    const priceMap = new Map<string, { price: string; currency: string }>();
    for (const pair of uniquePairs) {
      const [inst] = await ctx.db
        .select()
        .from(instruments)
        .where(and(eq(instruments.symbol, pair.symbol), eq(instruments.market, pair.market)))
        .limit(1);
      if (inst) {
        const [snap] = await ctx.db
          .select()
          .from(priceSnapshots)
          .where(eq(priceSnapshots.instrumentId, inst.id))
          .orderBy(desc(priceSnapshots.asOf))
          .limit(1);
        if (snap) {
          priceMap.set(`${pair.symbol}_${pair.market}`, { price: snap.price, currency: snap.currency });
        }
      }
    }

    return grants.map((grant) => {
      const vests = (vestsByGrant.get(grant.id) ?? []).map((v) => ({
        ...v,
        sells: sellsByVest.get(v.id) ?? [],
      }));
      const vested = vests.filter((v) => v.status === "vested").length;
      const next = vests.find((v) => v.status === "pending");
      const priceInfo = priceMap.get(`${grant.symbol}_${grant.market}`);
      return {
        ...grant,
        vests,
        vestedCount: vested,
        nextVest: next ?? null,
        currentPrice: priceInfo?.price ?? grant.estimatedPrice ?? null,
        priceCurrency: priceInfo?.currency ?? (grant.market === "TW" ? "TWD" : "USD"),
      };
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
        totalQuantity: quantity.optional(),
        startDate: isoDate,
        periods: z.number().int().min(1).max(120).default(48),
        frequency: z.enum(["monthly", "quarterly"]).default("monthly"),
        estimatedPrice: quantity.optional(),
        sellToCoverPct: z.number().min(0).max(100).default(0),
        customVests: z
          .array(
            z.object({
              periodIndex: z.number().int(),
              vestDate: isoDate.optional(),
              quantity: quantity,
            })
          )
          .optional(),
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

      // Calculate total quantity from customVests if provided
      let finalTotalQty = input.totalQuantity || "0";
      if (input.customVests && input.customVests.length > 0) {
        const sum = input.customVests.reduce((acc, v) => acc + Number(v.quantity), 0);
        finalTotalQty = String(sum);
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
            totalQuantity: finalTotalQty,
            startDate: input.startDate,
            periods: input.customVests?.length ?? input.periods,
            frequency: input.frequency,
            estimatedPrice: input.estimatedPrice || null,
            sellToCoverPct: String(input.sellToCoverPct),
          })
          .returning();

        await tx
          .insert(rsuVests)
          .values(
            rsuVestRows(
              grant!.id,
              finalTotalQty,
              input.startDate,
              grant!.periods,
              input.frequency,
              input.customVests
            )
          );

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
        frequency: z.enum(["monthly", "quarterly"]).optional(),
        estimatedPrice: quantity.nullable().optional(),
        sellToCoverPct: z.number().min(0).max(100).optional(),
        customVests: z
          .array(
            z.object({
              periodIndex: z.number().int(),
              vestDate: isoDate.optional(),
              quantity: quantity,
            })
          )
          .optional(),
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
        (input.periods != null && input.periods !== existing.periods) ||
        (input.frequency != null && input.frequency !== existing.frequency) ||
        input.customVests != null;

      if (scheduleChanged && anyVested) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "已有已入帳的期數，無法重構股數與發放排程，請新增新的授予計畫",
        });
      }

      let totalQuantity = input.totalQuantity ?? existing.totalQuantity;
      if (input.customVests && input.customVests.length > 0) {
        const sum = input.customVests.reduce((acc, v) => acc + Number(v.quantity), 0);
        totalQuantity = String(sum);
      }

      const startDate = input.startDate ?? existing.startDate;
      const periods = input.customVests?.length ?? (input.periods ?? existing.periods);
      const frequency = input.frequency ?? (existing.frequency as "monthly" | "quarterly");

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
            frequency,
            estimatedPrice:
              input.estimatedPrice !== undefined ? input.estimatedPrice : existing.estimatedPrice,
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
            .values(rsuVestRows(existing.id, totalQuantity, startDate, periods, frequency, input.customVests));
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

  sellVest: protectedProcedure
    .input(
      z.object({
        vestId: z.string().uuid(),
        soldDate: isoDate,
        soldPrice: quantity,
        soldFee: quantity.optional(),
        quantity: quantity.optional(),
        receivedAmount: quantity.optional(),
        receivedAccountId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [vest] = await ctx.db
        .select()
        .from(rsuVests)
        .where(eq(rsuVests.id, input.vestId))
        .limit(1);
      if (!vest) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU 領取紀錄" });
      if (vest.status !== "vested") throw new TRPCError({ code: "BAD_REQUEST", message: "該期尚未領取或已全數結清" });

      const [grant] = await ctx.db
        .select()
        .from(rsuGrants)
        .where(eq(rsuGrants.id, vest.grantId))
        .limit(1);
      if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "找不到授與紀錄" });

      const pct = vest.sellToCoverPct !== null && vest.sellToCoverPct !== undefined ? vest.sellToCoverPct : grant.sellToCoverPct;
      const netQty = Number(vest.quantity) * (1 - Number(pct) / 100);

      const sells = await ctx.db
        .select()
        .from(rsuSells)
        .where(eq(rsuSells.vestId, vest.id));

      const totalSold = sells.reduce((sum, s) => sum + Number(s.quantity), 0);
      const remaining = netQty - totalSold;

      const sellQty = input.quantity ? Number(input.quantity) : remaining;
      if (sellQty <= 0 || sellQty > remaining + 0.0001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `可賣出股數不足 (賸餘 ${remaining.toFixed(2)} 股)` });
      }

      const proceeds = input.receivedAmount ? Number(input.receivedAmount) : (Number(input.soldPrice) * sellQty - Number(input.soldFee || 0));
      const cashAcctId = input.receivedAccountId || grant.brokerAccountId;

      return ctx.db.transaction(async (tx) => {
        await tx.insert(rsuSells).values({
          userId: ctx.user.id,
          vestId: vest.id,
          soldDate: input.soldDate,
          quantity: String(sellQty),
          soldPrice: input.soldPrice,
          soldFee: input.soldFee || "0",
          receivedAmount: String(proceeds),
          receivedAccountId: cashAcctId || vest.id, // Fallback if no account
        });

        const isFullySold = (totalSold + sellQty) >= (netQty - 0.0001);
        if (isFullySold) {
          await tx
            .update(rsuVests)
            .set({
              status: "sold",
              soldDate: input.soldDate,
              soldPrice: input.soldPrice,
              soldFee: input.soldFee || "0",
            })
            .where(eq(rsuVests.id, vest.id));
        }

        await recalculateRsuHoldings(tx, grant.id);

        if (cashAcctId && proceeds > 0) {
          const proceedsMinor = BigInt(Math.round(proceeds * 100));
          await tx.insert(transactions).values({
            userId: ctx.user.id,
            accountId: cashAcctId,
            type: "income",
            amountMinor: proceedsMinor,
            currency: grant.market === "TW" ? "TWD" : "USD",
            occurredAt: new Date(input.soldDate),
            note: `RSU 賣出: ${grant.symbol} ${sellQty.toFixed(2)} 股`,
            source: "rsu",
          });
        }

        return { ok: true };
      });
    }),

  updateVest: protectedProcedure
    .input(
      z.object({
        vestId: z.string().uuid(),
        vestDate: isoDate.optional(),
        quantity: quantity.optional(),
        sellToCoverPct: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
        vestPrice: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
        status: z.enum(["pending", "vested", "sold"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [vest] = await ctx.db
        .select()
        .from(rsuVests)
        .where(eq(rsuVests.id, input.vestId))
        .limit(1);
      if (!vest) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU 領取紀錄" });

      await ctx.db.transaction(async (tx) => {
        const nextStatus = input.status ?? (input.vestPrice ? "vested" : vest.status);
        await tx
          .update(rsuVests)
          .set({
            vestDate: input.vestDate ?? vest.vestDate,
            quantity: input.quantity ?? vest.quantity,
            sellToCoverPct: input.sellToCoverPct !== undefined ? input.sellToCoverPct : vest.sellToCoverPct,
            vestPrice: input.vestPrice !== undefined ? input.vestPrice : vest.vestPrice,
            status: nextStatus,
          })
          .where(eq(rsuVests.id, vest.id));

        if (input.quantity && input.quantity !== vest.quantity) {
          const allVests = await tx
            .select({ quantity: rsuVests.quantity })
            .from(rsuVests)
            .where(eq(rsuVests.grantId, vest.grantId));
          const newTotalQty = allVests.reduce((sum, item) => sum + Number(item.quantity), 0);
          await tx
            .update(rsuGrants)
            .set({ totalQuantity: String(newTotalQty) })
            .where(eq(rsuGrants.id, vest.grantId));
        }

        await recalculateRsuHoldings(tx, vest.grantId);
      });
      return { ok: true };
    }),

  updateVestsBatch: protectedProcedure
    .input(
      z.object({
        grantId: z.string().uuid(),
        vests: z.array(
          z.object({
            id: z.string().uuid(),
            vestDate: isoDate.optional(),
            quantity: quantity.optional(),
            vestPrice: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
            sellToCoverPct: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
            status: z.enum(["pending", "vested", "sold"]).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [grant] = await ctx.db
        .select()
        .from(rsuGrants)
        .where(and(eq(rsuGrants.id, input.grantId), eq(rsuGrants.userId, ctx.user.id)))
        .limit(1);
      if (!grant) throw new TRPCError({ code: "NOT_FOUND", message: "找不到 RSU" });

      await ctx.db.transaction(async (tx) => {
        for (const v of input.vests) {
          const updateData: any = {};
          if (v.vestDate !== undefined) updateData.vestDate = v.vestDate;
          if (v.quantity !== undefined) updateData.quantity = v.quantity;
          if (v.vestPrice !== undefined) updateData.vestPrice = v.vestPrice;
          if (v.sellToCoverPct !== undefined) updateData.sellToCoverPct = v.sellToCoverPct;
          if (v.status !== undefined) updateData.status = v.status;

          if (Object.keys(updateData).length > 0) {
            await tx
              .update(rsuVests)
              .set(updateData)
              .where(and(eq(rsuVests.id, v.id), eq(rsuVests.grantId, grant.id)));
          }
        }

        const allVests = await tx
          .select({ quantity: rsuVests.quantity })
          .from(rsuVests)
          .where(eq(rsuVests.grantId, grant.id));
        const newTotalQty = allVests.reduce((sum, item) => sum + Number(item.quantity), 0);

        await tx
          .update(rsuGrants)
          .set({ totalQuantity: String(newTotalQty) })
          .where(eq(rsuGrants.id, grant.id));

        await recalculateRsuHoldings(tx, grant.id);
      });

      return { ok: true };
    }),

  fetchStockPrice: protectedProcedure
    .input(z.object({ symbol: z.string().min(1) }))
    .query(async ({ input }) => {
      const rawSym = input.symbol.trim().toUpperCase();
      const sym = rawSym.includes(".") ? rawSym : (rawSym.match(/^\d+$/) ? `${rawSym}.TW` : rawSym);
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) return { symbol: rawSym, price: null };
        const data = (await res.json()) as any;
        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        return { symbol: rawSym, price: price != null ? Number(price) : null };
      } catch {
        return { symbol: rawSym, price: null };
      }
    }),
});
