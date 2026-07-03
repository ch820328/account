import { db } from "@acc/db";
import { syncRouter } from "@acc/rpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

/** Machine-to-machine tRPC endpoint (quant trading → accounting). */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/rpc/sync",
    req,
    router: syncRouter,
    createContext: () => ({ db, headers: req.headers }),
  });

export { handler as GET, handler as POST };
