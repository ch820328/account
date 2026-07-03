import "dotenv/config";
import {
  generateDueInstallments,
  generateDueLoanPayments,
  generateDuePayrolls,
  generateDueRecurringTransactions,
  processDueRsuVests,
} from "@acc/core";
import { db } from "@acc/db";
import cron from "node-cron";

/**
 * Background worker. Runs scheduled jobs that don't belong in request handlers:
 *  - refresh FX rates (phase 2)
 *  - generate due recurring transactions (phase 3)
 *  - refresh stock/ETF prices (phase 4)
 *  - nightly database backup to Cloudflare R2 (production)
 *
 * Job bodies are stubs for phase 1 — the schedule + wiring is in place so later
 * phases only need to fill in the implementation in ./jobs/*.
 */

const TZ = process.env.TZ ?? "Asia/Taipei";

function schedule(name: string, expr: string, fn: () => Promise<void>) {
  cron.schedule(
    expr,
    async () => {
      const started = Date.now();
      console.log(`[worker] ${name} starting…`);
      try {
        await fn();
        console.log(`[worker] ${name} done in ${Date.now() - started}ms`);
      } catch (err) {
        console.error(`[worker] ${name} failed:`, err);
      }
    },
    { timezone: TZ },
  );
  console.log(`[worker] scheduled "${name}" (${expr}, ${TZ})`);
}

// Refresh FX rates every day at 06:00.
schedule("fx-refresh", "0 6 * * *", async () => {
  // TODO(phase 2): fetch from frankfurter.app with exchangerate.host failover,
  // upsert into fx_rates snapshots.
});

// Generate due recurring transactions every day at 00:10.
schedule("recurring-generate", "10 0 * * *", async () => {
  const recurring = await generateDueRecurringTransactions(db);
  const payroll = await generateDuePayrolls(db);
  const rsu = await processDueRsuVests(db);
  const installments = await generateDueInstallments(db);
  const loans = await generateDueLoanPayments(db);
  console.log(
    `[worker] scheduled: recurring=${recurring.created}, payroll=${payroll.created}, rsu=${rsu.vested}, installments=${installments.created}, loans=${loans.created}`,
  );
});

// Refresh instrument prices every weekday at 18:00 (after TW/US market data).
schedule("price-refresh", "0 18 * * 1-5", async () => {
  // TODO(phase 4): TWSE OpenAPI for TW, Yahoo/Finnhub for US, upsert price_snapshots.
});

// Nightly database backup to Cloudflare R2.
schedule("db-backup", process.env.BACKUP_CRON ?? "0 3 * * *", async () => {
  // TODO(prod): pg_dump | gzip -> upload to R2 (S3-compatible). Skips if R2_* unset.
  if (!process.env.R2_BUCKET) {
    console.log("[worker] db-backup skipped (R2 not configured)");
  }
});

console.log("[worker] started. Waiting for scheduled jobs…");
