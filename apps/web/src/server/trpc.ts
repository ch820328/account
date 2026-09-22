import { db } from "@acc/db";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { auth } from "./auth";

export async function createContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });
  return { db, session, headers: opts.headers };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// ---------------------------------------------------------------------------
// In-memory rate limiter — 120 requests per IP per minute.
// Designed for single-server self-hosted use. For multi-instance deployments,
// replace with a Redis-backed solution.
// ---------------------------------------------------------------------------
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "local"
  );
}

function checkRateLimit(ip: string, maxPerMinute = 120): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60_000 };
  }
  bucket.count++;
  rateBuckets.set(ip, bucket);

  // Periodic cleanup to prevent unbounded memory growth (~10 k unique IPs max)
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) {
      if (Date.now() > v.resetAt) rateBuckets.delete(k);
    }
  }

  return bucket.count <= maxPerMinute;
}

// ---------------------------------------------------------------------------
// tRPC setup
// ---------------------------------------------------------------------------
const t = initTRPC.context<Context>().create({
  // superjson preserves bigint (money minor units), Date, etc. across the wire.
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const rateLimitMiddleware = t.middleware(({ ctx, next }) => {
  const ip = getClientIp(ctx.headers);
  if (!checkRateLimit(ip)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "請求過於頻繁，請稍後再試（每分鐘上限 120 次）",
    });
  }
  return next();
});

export const protectedProcedure = t.procedure
  .use(rateLimitMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({ ctx: { ...ctx, user: ctx.session.user } });
  });
