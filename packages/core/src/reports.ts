import { type Database, accounts, categories, transactions } from "@acc/db";
import { and, asc, eq, gte, lt, lte, or, isNull } from "drizzle-orm";
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
  nowOrMonth?: Date | string,
  baseCurrencyOverride?: string,
): Promise<MonthlyBreakdown> {
  const base = (baseCurrencyOverride || getBaseCurrency()).toUpperCase();
  let start: Date;
  let end: Date;
  let monthStr: string;

  if (typeof nowOrMonth === "string" && /^\d{4}-\d{2}$/.test(nowOrMonth)) {
    monthStr = nowOrMonth;
    const [y, m] = nowOrMonth.split("-").map(Number);
    start = new Date(y!, m! - 1, 1);
    end = new Date(y!, m!, 1);
  } else {
    const ref = nowOrMonth instanceof Date ? nowOrMonth : new Date();
    monthStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    start = new Date(ref.getFullYear(), ref.getMonth(), 1);
    end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  }

  const [rates, rows] = await Promise.all([
    latestFxRates(db, end),
    db
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
          or(
            eq(transactions.statementMonth, monthStr),
            and(
              or(isNull(transactions.statementMonth), eq(transactions.statementMonth, "")),
              gte(transactions.occurredAt, start),
              lt(transactions.occurredAt, end),
            ),
          ),
        ),
      ),
  ]);

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

export interface AnnualBreakdown extends MonthlyBreakdown {
  year: number;
}

/** Income & expense-by-source breakdown for an entire calendar year, in base currency. */
export async function annualBreakdown(
  db: Database,
  userId: string,
  year: number = new Date().getFullYear(),
  baseCurrencyOverride?: string,
): Promise<AnnualBreakdown> {
  const base = (baseCurrencyOverride || getBaseCurrency()).toUpperCase();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const yearStr = String(year);

  const [rates, rows] = await Promise.all([
    latestFxRates(db, end),
    db
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
          or(
            and(
              gte(transactions.statementMonth, `${yearStr}-01`),
              lte(transactions.statementMonth, `${yearStr}-12`),
            ),
            and(
              or(isNull(transactions.statementMonth), eq(transactions.statementMonth, "")),
              gte(transactions.occurredAt, start),
              lt(transactions.occurredAt, end),
            ),
          ),
        ),
      ),
  ]);

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
    year,
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
  baseCurrencyOverride?: string,
): Promise<{ baseCurrency: string; points: MonthlyPoint[] }> {
  const base = (baseCurrencyOverride || getBaseCurrency()).toUpperCase();
  const rates = await latestFxRates(db, now);
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
export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  parentName: string;
  expenseMinor: bigint;
}

/** Expense totals by category for a single month (YYYY-MM), base currency. */
export async function monthCategoryTotals(
  db: Database,
  userId: string,
  month: string,
  baseCurrencyOverride?: string,
): Promise<{ baseCurrency: string; totals: CategoryTotal[] }> {
  const base = (baseCurrencyOverride || getBaseCurrency()).toUpperCase();
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 1);

  const [rates, allCats, rows] = await Promise.all([
    latestFxRates(db, end),
    db.select().from(categories).where(eq(categories.userId, userId)),
    db
      .select({
        categoryId: transactions.categoryId,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        source: transactions.source,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          or(
            eq(transactions.statementMonth, month),
            and(
              or(isNull(transactions.statementMonth), eq(transactions.statementMonth, "")),
              gte(transactions.occurredAt, start),
              lt(transactions.occurredAt, end),
            ),
          ),
        ),
      ),
  ]);

  const catMap = new Map(allCats.map((c) => [c.id, c]));

  const byCatKey = new Map<string, CategoryTotal>();
  for (const r of rows) {
    let name = "未分類";
    let parentName = "待分類項目";
    const catId: string | null = r.categoryId;

    if (r.categoryId && catMap.has(r.categoryId)) {
      const cat = catMap.get(r.categoryId)!;
      name = cat.name;
      if (cat.parentId && catMap.has(cat.parentId)) {
        parentName = catMap.get(cat.parentId)!.name;
      } else {
        parentName = cat.name;
      }
    } else if (r.source !== "manual") {
      name = "自動排程";
      parentName = "固定扣款";
    }

    const key = `${parentName}:::${name}`;
    const baseAmt = toBaseMinor(r.amountMinor, r.currency, base, rates);
    const existing = byCatKey.get(key);
    if (existing) {
      existing.expenseMinor += baseAmt;
    } else {
      byCatKey.set(key, { categoryId: catId, name, parentName, expenseMinor: baseAmt });
    }
  }

  // Ensure all user expense categories (parents) are represented, even if 0 expense
  const parentCats = allCats.filter((c) => c.kind === "expense" && !c.parentId);
  for (const p of parentCats) {
    const hasParentEntries = [...byCatKey.values()].some((item) => item.parentName === p.name);
    if (!hasParentEntries) {
      const children = allCats.filter((c) => c.parentId === p.id);
      if (children.length > 0) {
        for (const child of children) {
          const key = `${p.name}:::${child.name}`;
          byCatKey.set(key, { categoryId: child.id, name: child.name, parentName: p.name, expenseMinor: 0n });
        }
      } else {
        const key = `${p.name}:::${p.name}`;
        byCatKey.set(key, { categoryId: p.id, name: p.name, parentName: p.name, expenseMinor: 0n });
      }
    }
  }

  const totals = [...byCatKey.values()].sort((a, b) => (b.expenseMinor > a.expenseMinor ? 1 : b.expenseMinor < a.expenseMinor ? -1 : 0));
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


/** This-year expense totals grouped by category (base currency, desc). */
export async function categoryExpenseTotals(
  db: Database,
  userId: string,
  year: number = new Date().getFullYear(),
  baseCurrencyOverride?: string,
): Promise<{ baseCurrency: string; totals: CategoryTotal[] }> {
  const base = (baseCurrencyOverride || getBaseCurrency()).toUpperCase();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const rates = await latestFxRates(db, end);

  const userCats = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));
  const catMap = new Map(userCats.map((c) => [c.id, c]));

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

  const byCatKey = new Map<string, CategoryTotal>();
  for (const r of rows) {
    let name = "未分類";
    let parentName = "一般支出";
    const catId: string | null = r.categoryId;

    if (r.categoryId && catMap.has(r.categoryId)) {
      const c = catMap.get(r.categoryId)!;
      name = c.name;
      if (c.parentId && catMap.has(c.parentId)) {
        parentName = catMap.get(c.parentId)!.name;
      } else {
        parentName = c.name;
      }
    }

    const key = `${parentName}:::${name}`;
    const amt = toBaseMinor(r.amountMinor, r.currency, base, rates);
    const existing = byCatKey.get(key);
    if (existing) {
      existing.expenseMinor += amt;
    } else {
      byCatKey.set(key, { categoryId: catId, name, parentName, expenseMinor: amt });
    }
  }

  const totals = [...byCatKey.values()].sort((a, b) => (b.expenseMinor > a.expenseMinor ? 1 : -1));

  return { baseCurrency: base, totals };
}
