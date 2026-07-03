import {
  ingestFxRates,
  ingestHoldings,
  ingestPrices,
  resolveSyncUserId,
  todayIsoDate,
  upsertInstruments,
} from "@acc/core";
import type { Database } from "@acc/db";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
  syncHoldingsInput,
  upsertFxInput,
  upsertInstrumentsInput,
  upsertPricesInput,
} from "./schemas";

/** Context for machine-to-machine sync (quant trading backend → accounting). */
export type SyncContext = {
  db: Database;
  headers: Headers;
};

const t = initTRPC.context<SyncContext>().create({
  transformer: superjson,
});

function readSyncToken(headers: Headers): string {
  const direct = headers.get("x-sync-api-key");
  if (direct) return direct;
  const auth = headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

const syncProcedure = t.procedure.use(({ ctx, next }) => {
  const expected = process.env.SYNC_API_KEY;
  if (!expected) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "SYNC_API_KEY is not configured on the accounting server",
    });
  }
  const token = readSyncToken(ctx.headers);
  if (!token || token !== expected) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid sync API key" });
  }
  return next({ ctx });
});

/**
 * Dedicated sync router for backend-to-backend RPC.
 * Quant trading service calls this; accounting only stores the data.
 */
export const syncRouter = t.router({
  ping: syncProcedure.query(() => ({
    ok: true as const,
    service: "accounting-sync",
    version: 1,
  })),

  upsertInstruments: syncProcedure.input(upsertInstrumentsInput).mutation(async ({ ctx, input }) => {
    return upsertInstruments(ctx.db, input.instruments);
  }),

  upsertPrices: syncProcedure.input(upsertPricesInput).mutation(async ({ ctx, input }) => {
    return ingestPrices(ctx.db, {
      asOf: input.asOf ?? todayIsoDate(),
      source: input.source ?? "quant-trading",
      prices: input.prices,
    });
  }),

  upsertFx: syncProcedure.input(upsertFxInput).mutation(async ({ ctx, input }) => {
    return ingestFxRates(ctx.db, {
      asOf: input.asOf ?? todayIsoDate(),
      source: input.source ?? "quant-trading",
      rates: input.rates,
    });
  }),

  syncHoldings: syncProcedure.input(syncHoldingsInput).mutation(async ({ ctx, input }) => {
    const userId = await resolveSyncUserId(ctx.db);
    return ingestHoldings(ctx.db, userId, {
      source: input.source ?? "quant-trading",
      replace: input.replace,
      holdings: input.holdings,
    });
  }),
});

export type SyncRouter = typeof syncRouter;
