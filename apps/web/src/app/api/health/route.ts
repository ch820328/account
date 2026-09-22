import { db } from "@acc/db";
import { jobRuns } from "@acc/db";
import { sql, desc, eq } from "drizzle-orm";

/**
 * GET /api/health
 *
 * Returns service health status including:
 * - Database connectivity
 * - Latest worker job run status per job name
 * - Current server timestamp
 *
 * Use this endpoint with Uptime Kuma, Tailscale health checks, or any
 * external monitoring that supports HTTP polling.
 *
 * Response codes:
 *   200 — healthy (DB reachable)
 *   503 — unhealthy (DB unreachable or unhandled error)
 */
export async function GET() {
  try {
    // Lightweight DB connectivity check
    await db.execute(sql`SELECT 1`);

    // Fetch most recent run per job name for status dashboard
    const rows = await db
      .select({
        name: jobRuns.name,
        status: jobRuns.status,
        message: jobRuns.message,
        ranAt: jobRuns.ranAt,
      })
      .from(jobRuns)
      .orderBy(desc(jobRuns.ranAt));

    // Deduplicate: keep only the latest run per job name
    const jobStatus: Record<string, { status: string; message: string | null; ranAt: string }> = {};
    for (const row of rows) {
      if (!jobStatus[row.name]) {
        jobStatus[row.name] = {
          status: row.status,
          message: row.message ?? null,
          ranAt: row.ranAt instanceof Date ? row.ranAt.toISOString() : String(row.ranAt),
        };
      }
    }

    // Surface any recent job failures as a top-level warning
    const hasFailures = Object.values(jobStatus).some((j) => j.status === "error");

    return Response.json(
      {
        status: hasFailures ? "degraded" : "ok",
        db: "connected",
        jobs: jobStatus,
        ts: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    return Response.json(
      {
        status: "error",
        db: "unreachable",
        error: (err as Error).message,
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
