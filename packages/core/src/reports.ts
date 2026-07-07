import { type Database, accounts, categories, transactions } from "@acc/db";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { isLiabilityAccount } from "./accounts";
import { getBaseCurrency } from "./currency";
import { latestFxRates, toBaseMinor } from "./net-worth";

export interface MonthlyBreakdown {
  baseCurrency: string;
  incomeMinor: bigint;
  /** Total of expense-type transactions (excludes loan transfers). */
  expenseMinor: bigint;
  living: bigint;
  installment: bigint;
  recurring: bigint;
  payroll: bigint;
  other: bigint;
  /** Loan repayments are transfers (bank → liability), tracked separately. */
  loanTransfer: bigint;
}

/** Income & expense-by-source breakdown for the current month, in base currency. */
export async function monthlyBreakdown(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<MonthlyBreakdown> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      source: transactions.source,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    );

  let incomeMinor = 0n;
  let living = 0n;
  let installment = 0n;
  let recurring = 0n;
  let payroll = 0n;
  let other = 0n;
  let loanTransfer = 0n;

  for (const r of rows) {
    const amt = toBaseMinor(r.amountMinor, r.currency, base, rates);
    if (r.type === "income") {
      incomeMinor += amt;
    } else if (r.type === "expense") {
      switch (r.source) {
        case "manual":
          living += amt;
          break;
        case "installment":
          installment += amt;
          break;
        case "recurring":
          recurring += amt;
          break;
        case "payroll":
          payroll += amt;
          break;
        default:
          other += amt;
      }
    } else if (r.type === "transfer" && r.source === "loan") {
      loanTransfer += amt;
    }
  }

  return {
    baseCurrency: base,
    incomeMinor,
    expenseMinor: living + installment + recurring + payroll + other,
    living,
    installment,
    recurring,
    payroll,
    other,
    loanTransfer,
  };
}

export interface MonthlyPoint {
  month: string;
  incomeMinor: bigint;
  expenseMinor: bigint;
}

/** Income vs expense per month for the last `months` months (base currency). */
export async function incomeExpenseTrend(
  db: Database,
  userId: string,
  months = 12,
  now: Date = new Date(),
): Promise<{ baseCurrency: string; points: MonthlyPoint[] }> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const rows = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.occurredAt, start)));

  const byMonth = new Map<string, { income: bigint; expense: bigint }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, { income: 0n, expense: 0n });
  }

  for (const r of rows) {
    const d = new Date(r.occurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    const amt = toBaseMinor(r.amountMinor, r.currency, base, rates);
    if (r.type === "income") bucket.income += amt;
    else if (r.type === "expense") bucket.expense += amt;
  }

  const points = [...byMonth.entries()].map(([month, v]) => ({
    month,
    incomeMinor: v.income,
    expenseMinor: v.expense,
  }));

  return { baseCurrency: base, points };
}

/**
 * Effect of one transaction on total "cash on hand" (asset accounts only),
 * in base minor units. Pure helper so it can be unit-tested.
 */
export function cashDelta(
  tx: {
    type: string;
    amtBase: bigint;
    sourceIsAsset: boolean;
    destIsAsset: boolean;
  },
): bigint {
  if (tx.type === "income") return tx.sourceIsAsset ? tx.amtBase : 0n;
  if (tx.type === "expense") return tx.sourceIsAsset ? -tx.amtBase : 0n;
  if (tx.type === "transfer") {
    let d = 0n;
    if (tx.sourceIsAsset) d -= tx.amtBase;
    if (tx.destIsAsset) d += tx.amtBase;
    return d;
  }
  return 0n;
}

export interface MonthlyHistoryRow {
  month: string;
  incomeMinor: bigint;
  expenseMinor: bigint;
  netMinor: bigint;
  /** Cash on hand (asset accounts) at the end of the month, from the ledger. */
  endCashMinor: bigint;
}

/**
 * Per-month history reproducible from the ledger: income, expense, net, and
 * end-of-month cash balance. Ideal for month-by-month reconciliation.
 */
export async function monthlyHistory(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<{ baseCurrency: string; months: MonthlyHistoryRow[] }> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const toBase = (m: bigint, c: string) => toBaseMinor(m, c, base, rates);

  const accts = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const assetIds = new Set(accts.filter((a) => !isLiabilityAccount(a.type)).map((a) => a.id));
  let running = accts
    .filter((a) => !isLiabilityAccount(a.type))
    .reduce((s, a) => s + toBase(a.openingBalanceMinor, a.currency), 0n);

  const txs = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(asc(transactions.occurredAt));

  const monthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const firstDate = txs.length ? new Date(txs[0]!.occurredAt) : now;
  const stats = new Map<string, { income: bigint; expense: bigint }>();

  // Build the ordered month range from the first transaction to the current month.
  const order: string[] = [];
  {
    const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= end) {
      const key = monthKey(cursor);
      order.push(key);
      stats.set(key, { income: 0n, expense: 0n });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const endCashByMonth = new Map<string, bigint>();
  let ti = 0;
  for (const key of order) {
    while (ti < txs.length && monthKey(new Date(txs[ti]!.occurredAt)) === key) {
      const t = txs[ti]!;
      const amt = toBase(t.amountMinor, t.currency);
      const bucket = stats.get(key)!;
      if (t.type === "income") bucket.income += amt;
      else if (t.type === "expense") bucket.expense += amt;
      running += cashDelta({
        type: t.type,
        amtBase: amt,
        sourceIsAsset: assetIds.has(t.accountId),
        destIsAsset: t.transferAccountId ? assetIds.has(t.transferAccountId) : false,
      });
      ti += 1;
    }
    endCashByMonth.set(key, running);
  }

  const months = order.map((key) => {
    const s = stats.get(key)!;
    return {
      month: key,
      incomeMinor: s.income,
      expenseMinor: s.expense,
      netMinor: s.income - s.expense,
      endCashMinor: endCashByMonth.get(key) ?? 0n,
    };
  });
  months.reverse(); // newest first

  return { baseCurrency: base, months };
}

/** Expense totals by category for a single month (YYYY-MM), base currency. */
export async function monthCategoryTotals(
  db: Database,
  userId: string,
  month: string,
): Promise<{ baseCurrency: string; totals: CategoryTotal[] }> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 1);

  const rows = await db
    .select({
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      categoryName: categories.name,
      source: transactions.source,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    );

  const byCat = new Map<string, bigint>();
  for (const r of rows) {
    const name = r.categoryName ?? (r.source !== "manual" ? "自動排程" : "未分類");
    byCat.set(name, (byCat.get(name) ?? 0n) + toBaseMinor(r.amountMinor, r.currency, base, rates));
  }
  const totals = [...byCat.entries()]
    .map(([name, expenseMinor]) => ({ name, expenseMinor }))
    .sort((a, b) => (b.expenseMinor > a.expenseMinor ? 1 : -1));
  return { baseCurrency: base, totals };
}

/** This-month expense per category id (base minor units). Powers budgets. */
export async function monthExpenseByCategoryId(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<Map<string, bigint>> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const rows = await db
    .select({
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    );

  const byId = new Map<string, bigint>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    byId.set(
      r.categoryId,
      (byId.get(r.categoryId) ?? 0n) + toBaseMinor(r.amountMinor, r.currency, base, rates),
    );
  }
  return byId;
}

export interface CategoryTotal {
  name: string;
  expenseMinor: bigint;
}

/** This-year expense totals grouped by category (base currency, desc). */
export async function categoryExpenseTotals(
  db: Database,
  userId: string,
  year: number = new Date().getFullYear(),
): Promise<{ baseCurrency: string; totals: CategoryTotal[] }> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const rows = await db
    .select({
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    );

  const byCat = new Map<string, bigint>();
  for (const r of rows) {
    const name = r.categoryName ?? "未分類";
    const amt = toBaseMinor(r.amountMinor, r.currency, base, rates);
    byCat.set(name, (byCat.get(name) ?? 0n) + amt);
  }

  const totals = [...byCat.entries()]
    .map(([name, expenseMinor]) => ({ name, expenseMinor }))
    .sort((a, b) => (b.expenseMinor > a.expenseMinor ? 1 : -1));

  return { baseCurrency: base, totals };
}
