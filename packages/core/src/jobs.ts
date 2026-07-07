import { type Database, jobRuns } from "@acc/db";

export type JobStatus = "success" | "error" | "skipped";

/** Upsert the latest run outcome for a named worker job. */
export async function recordJobRun(
  db: Database,
  name: string,
  status: JobStatus,
  message?: string,
): Promise<void> {
  await db
    .insert(jobRuns)
    .values({ name, status, message: message ?? null, ranAt: new Date() })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { status, message: message ?? null, ranAt: new Date() },
    });
}
