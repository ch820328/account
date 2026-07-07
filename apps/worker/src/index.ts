import "dotenv/config";
import {
  generateDueInstallments,
  generateDueLoanPayments,
  generateDuePayrolls,
  generateDueRecurringTransactions,
  processDueRsuVests,
  recordJobRun,
  refreshFxRates,
  refreshPrices,
  snapshotAllUsersNetWorth,
} from "@acc/core";
import { db } from "@acc/db";
import cron from "node-cron";
import { backupDatabaseToR2 } from "./backup";

/**
 * Background worker. Runs scheduled jobs that don't belong in request handlers:
 *  - refresh FX rates (open.er-api.com)
 *  - generate due recurring / payroll / RSU / installment / loan transactions
 *  - refresh stock/ETF prices (TWSE + stooq)
 *  - daily net-worth snapshot for trend charts
 *  - nightly database backup to Cloudflare R2 (if configured)
 */

const TZ = process.env.TZ ?? "Asia/Taipei";

function schedule(name: string, expr: string, fn: () => Promise<string | void>) {
  cron.schedule(
    expr,
    async () => {
      const started = Date.now();
      console.log(`[worker] ${name} starting…`);
      try {
        const message = await fn();
        console.log(`[worker] ${name} done in ${Date.now() - started}ms`);
        await recordJobRun(db, name, "success", message || undefined).catch(() => {});
      } catch (err) {
        console.error(`[worker] ${name} failed:`, err);
        await recordJobRun(db, name, "error", (err as Error).message).catch(() => {});
      }
    },
    { timezone: TZ },
  );
  console.log(`[worker] scheduled "${name}" (${expr}, ${TZ})`);
}

// Refresh FX rates every day at 06:00.
schedule("fx-refresh", "0 6 * * *", async () => {
  const { written } = await refreshFxRates(db);
  return `${written} 筆匯率更新`;
});

// Generate due recurring transactions every day at 00:10.
schedule("recurring-generate", "10 0 * * *", async () => {
  const recurring = await generateDueRecurringTransactions(db);
  const payroll = await generateDuePayrolls(db);
  const rsu = await processDueRsuVests(db);
  const installments = await generateDueInstallments(db);
  const loans = await generateDueLoanPayments(db);
  return `定期=${recurring.created}, 薪資=${payroll.created}, RSU=${rsu.vested}, 分期=${installments.created}, 貸款=${loans.created}`;
});

// Refresh instrument prices every weekday at 18:00 (after TW/US market data).
schedule("price-refresh", "0 18 * * 1-5", async () => {
  const { updated, failed } = await refreshPrices(db);
  return `${updated} 檔更新, ${failed} 檔失敗`;
});

// Daily net-worth snapshot for trend charts at 00:30 (after generators).
schedule("net-worth-snapshot", "30 0 * * *", async () => {
  const { users } = await snapshotAllUsersNetWorth(db);
  return `${users} 位使用者`;
});

// Nightly database backup to Cloudflare R2.
schedule("db-backup", process.env.BACKUP_CRON ?? "0 3 * * *", async () => {
  const key = await backupDatabaseToR2();
  return key ? `已上傳 ${key}` : "略過（未設定 R2）";
});

console.log("[worker] started. Waiting for scheduled jobs…");
