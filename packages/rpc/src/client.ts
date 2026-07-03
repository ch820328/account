import type { SyncRouter } from "./sync-router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

export interface AccountingSyncClientOptions {
  /** Base URL of the accounting app, e.g. http://localhost:50300 */
  baseUrl: string;
  /** Same value as SYNC_API_KEY on the accounting server. */
  apiKey: string;
}

/**
 * tRPC client for the quant trading backend to push data into accounting.
 *
 * @example
 * ```ts
 * const accounting = createAccountingSyncClient({
 *   baseUrl: process.env.ACCOUNTING_URL!,
 *   apiKey: process.env.SYNC_API_KEY!,
 * });
 * await accounting.upsertPrices.mutate({
 *   prices: [{ symbol: "2330", market: "TW", price: "580", currency: "TWD" }],
 * });
 * ```
 */
export function createAccountingSyncClient(opts: AccountingSyncClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");
  return createTRPCClient<SyncRouter>({
    links: [
      httpBatchLink({
        url: `${base}/api/rpc/sync`,
        transformer: superjson,
        headers: () => ({
          "x-sync-api-key": opts.apiKey,
        }),
      }),
    ],
  });
}

export type AccountingSyncClient = ReturnType<typeof createAccountingSyncClient>;
