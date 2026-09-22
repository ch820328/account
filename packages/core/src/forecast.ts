import {
  type Database,
  forecastSettings,
  installmentSchedules,
  instruments,
  loanPaymentSchedules,
  loanPaymentTiers,
  monthlyForecasts,
  payrollLines,
  payrollProfiles,
  priceSnapshots,
  recurringRules,
  rsuGrants,
  rsuVests,
  transactions,
} from "@acc/db";
import { fromDecimal, multiply } from "@acc/money";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getBaseCurrency } from "./currency";
import { computeNetWorth, latestFxRates, toBaseMinor } from "./net-worth";
import { sumPayrollLines } from "./payroll";
import { netVestQuantity } from "./rsu";

export interface ForecastMonthRow {
  month: string;
  livingExpenseMinor: bigint;
  actualExpenseMinor?: bigint | null;
  isActual: boolean;
  scheduledIncomeMinor: bigint;
  scheduledExpenseMinor: bigint;
  /** Market value of RSU shares vesting this month. */
  rsuVestValueMinor: bigint;
  netCashflowMinor: bigint;
  projectedNetWorthMinor: bigint;
  projectedCashMinor: bigint;
}

export interface AssetForecast {
  baseCurrency: string;
  currentNetWorthMinor: bigint;
  currentCashMinor: bigint;
  defaultLivingExpenseMinor: bigint;
  horizonMonths: number;
  livingExpenseCategoryIds: string[];
  months: ForecastMonthRow[];
}

function monthStart(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex, 1);
}

function formatMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthIso(d: Date): string {
  return `${formatMonthKey(d)}-01`;
}

/** Parse comma-separated category ids into a Set, or null if none configured. */
export function parseCategoryIds(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

async function getOrCreateSettings(db: Database, userId: string) {
  const [existing] = await db
    .select()
    .from(forecastSettings)
    .where(eq(forecastSettings.userId, userId))
    .limit(1);

  if (existing) return existing;

  const currency = getBaseCurrency();
  const [created] = await db
    .insert(forecastSettings)
    .values({ userId, currency, defaultLivingExpenseMinor: 0n })
    .returning();
  return created!;
}

interface LoanProjection {
  /** Amount for offset i (0-based from current month), null once fully paid. */
  amountAt: (offset: number) => bigint | null;
}

interface MonthlyScheduleContext {
  payrollIncome: bigint;
  recurring: {
    kind: string;
    frequency: string;
    interval: number;
    startMonthKey: string;
    triggerMonthNumber: number;
    amountMinor: bigint;
    endMonthKey: string | null;
  }[];
  installments: { amountMinor: bigint; remaining: number | null }[];
  loans: LoanProjection[];
  /** RSU vest market value per month key (base currency minor units). */
  rsuVestByMonth: Map<string, bigint>;
}

/** Count how many payments of an installment remain (null = open-ended). */
function remainingPeriods(totalPeriods: number | null, completed: number): number | null {
  if (totalPeriods == null) return null;
  return Math.max(0, totalPeriods - completed);
}

async function buildScheduleContext(
  db: Database,
  userId: string,
  base: string,
  nw: Awaited<ReturnType<typeof computeNetWorth>>,
): Promise<MonthlyScheduleContext> {
  // All scheduled amounts are converted to the base currency up front so the
  // month-by-month projection loop can stay currency-agnostic.
  const rates = await latestFxRates(db);
  const toBase = (amountMinor: bigint, currency: string) =>
    toBaseMinor(amountMinor, currency, base, rates);

  let payrollIncome = 0n;

  const profiles = await db
    .select()
    .from(payrollProfiles)
    .where(and(eq(payrollProfiles.userId, userId), eq(payrollProfiles.active, true)));

  if (profiles.length > 0) {
    const lines = await db
      .select()
      .from(payrollLines)
      .where(inArray(payrollLines.profileId, profiles.map((p) => p.id)));
    const linesByProfile = new Map<string, typeof lines>();
    for (const line of lines) {
      const list = linesByProfile.get(line.profileId);
      if (list) list.push(line);
      else linesByProfile.set(line.profileId, [line]);
    }
    for (const profile of profiles) {
      const net = sumPayrollLines(linesByProfile.get(profile.id) ?? []).netMinor;
      payrollIncome += toBase(net, profile.currency);
    }
  }

  const rules = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true)));

  const recurring = rules.map((r) => {
    const triggerDateStr = r.anchorDate || r.nextRunDate;
    const startMonthKey = triggerDateStr ? triggerDateStr.slice(0, 7) : "2000-01";
    let triggerMonthNumber = 1;
    if (triggerDateStr) {
      const parts = triggerDateStr.split("-");
      if (parts.length >= 2) {
        triggerMonthNumber = Number(parts[1]);
      }
    }

    return {
      kind: r.kind,
      frequency: r.frequency,
      interval: r.interval || 1,
      startMonthKey,
      triggerMonthNumber,
      amountMinor: toBase(r.amountMinor, r.currency),
      endMonthKey: r.endDate ? r.endDate.slice(0, 7) : null,
    };
  });

  const installmentRows = await db
    .select()
    .from(installmentSchedules)
    .where(and(eq(installmentSchedules.userId, userId), eq(installmentSchedules.active, true)));

  const installments = installmentRows
    .filter((i) => remainingPeriods(i.totalPeriods, i.completedPeriods) !== 0)
    .map((i) => ({
      amountMinor: toBase(i.amountMinor, i.currency),
      remaining: remainingPeriods(i.totalPeriods, i.completedPeriods),
    }));

  // Loans: use stepped tiers when present, else estimate remaining months from
  // the liability account balance owed.
  const loanRows = await db
    .select()
    .from(loanPaymentSchedules)
    .where(and(eq(loanPaymentSchedules.userId, userId), eq(loanPaymentSchedules.active, true)));

  const owedByAccount = new Map<string, bigint>();
  for (const acct of nw.accounts) {
    if (acct.isLiability) owedByAccount.set(acct.accountId, -acct.netMinorBase);
  }

  const loanTierRows = loanRows.length
    ? await db
        .select()
        .from(loanPaymentTiers)
        .where(inArray(loanPaymentTiers.scheduleId, loanRows.map((l) => l.id)))
    : [];
  const tiersBySchedule = new Map<string, { fromPeriod: number; toPeriod: number; amountMinor: bigint }[]>();
  for (const t of loanTierRows) {
    const list = tiersBySchedule.get(t.scheduleId) ?? [];
    list.push({ fromPeriod: t.fromPeriod, toPeriod: t.toPeriod, amountMinor: t.amountMinor });
    tiersBySchedule.set(t.scheduleId, list);
  }

  const loans: LoanProjection[] = loanRows.map((l) => {
    const tiers = tiersBySchedule.get(l.id) ?? [];
    const completed = l.completedPeriods;
    const defaultBase = toBase(l.amountMinor, l.currency);

    // Remaining count: prefer totalPeriods, else estimate from owed balance.
    let remaining: number | null = null;
    if (l.totalPeriods != null) {
      remaining = Math.max(0, l.totalPeriods - completed);
    } else {
      const owed = owedByAccount.get(l.liabilityAccountId);
      if (owed != null && owed > 0n && l.amountMinor > 0n) {
        remaining = Number((owed + l.amountMinor - 1n) / l.amountMinor);
      }
    }

    return {
      amountAt: (offset: number) => {
        if (remaining != null && offset >= remaining) return null;
        const period = completed + offset + 1;
        for (const tier of tiers) {
          if (period >= tier.fromPeriod && period <= tier.toPeriod) {
            return toBase(tier.amountMinor, l.currency);
          }
        }
        return defaultBase;
      },
    };
  });

  // RSU: pending vests -> market value in base currency, bucketed by month.
  const rsuVestByMonth = new Map<string, bigint>();

  const pendingVests = await db
    .select({
      vestDate: rsuVests.vestDate,
      quantity: rsuVests.quantity,
      symbol: rsuGrants.symbol,
      market: rsuGrants.market,
      sellToCoverPct: rsuGrants.sellToCoverPct,
    })
    .from(rsuVests)
    .innerJoin(rsuGrants, eq(rsuVests.grantId, rsuGrants.id))
    .where(
      and(
        eq(rsuGrants.userId, userId),
        eq(rsuGrants.active, true),
        eq(rsuVests.status, "pending"),
      ),
    );

  if (pendingVests.length > 0) {
    const symbols = [...new Set(pendingVests.map((v) => `${v.symbol}_${v.market}`))];
    const priceByKey = new Map<string, { price: string; currency: string }>();

    const instrumentRows = await db.select().from(instruments);
    const instrumentByKey = new Map(
      instrumentRows.map((i) => [`${i.symbol}_${i.market}`, i]),
    );

    const relevantIds = symbols
      .map((k) => instrumentByKey.get(k)?.id)
      .filter((x): x is string => !!x);

    if (relevantIds.length > 0) {
      const snaps = await db
        .select()
        .from(priceSnapshots)
        .where(inArray(priceSnapshots.instrumentId, relevantIds))
        .orderBy(desc(priceSnapshots.asOf));
      const byInstrument = new Map<string, { price: string; currency: string }>();
      for (const s of snaps) {
        if (!byInstrument.has(s.instrumentId)) {
          byInstrument.set(s.instrumentId, { price: s.price, currency: s.currency });
        }
      }
      for (const [key, inst] of instrumentByKey) {
        const snap = byInstrument.get(inst.id);
        if (snap) priceByKey.set(key, snap);
      }
    }

    for (const v of pendingVests) {
      const key = `${v.symbol}_${v.market}`;
      const snap = priceByKey.get(key);
      if (!snap) continue;
      // Only the net-of-tax shares actually land in holdings.
      const netQty = netVestQuantity(v.quantity, v.sellToCoverPct);
      if (Number(netQty) <= 0) continue;
      const value = multiply(fromDecimal(snap.price, snap.currency), netQty);
      const baseValue = toBaseMinor(value.amount, value.currency, base, rates);
      const monthKey = v.vestDate.slice(0, 7);
      rsuVestByMonth.set(monthKey, (rsuVestByMonth.get(monthKey) ?? 0n) + baseValue);
    }
  }

  return { payrollIncome, recurring, installments, loans, rsuVestByMonth };
}

export async function computeAssetForecast(
  db: Database,
  userId: string,
): Promise<AssetForecast> {
  const settings = await getOrCreateSettings(db, userId);
  const nw = await computeNetWorth(db, userId);
  const ctx = await buildScheduleContext(db, userId, settings.currency, nw);

  const overrides = await db
    .select()
    .from(monthlyForecasts)
    .where(eq(monthlyForecasts.userId, userId));

  const overrideByMonth = new Map(overrides.map((o) => [o.month.slice(0, 7), o]));

  const now = new Date();
  let runningCash = nw.cashAndBankMinor;
  let runningNetWorth = nw.totalMinor;
  const months: ForecastMonthRow[] = [];

  for (let i = 0; i < settings.horizonMonths; i++) {
    const d = monthStart(now.getFullYear(), now.getMonth() + i);
    const key = formatMonthKey(d);
    const override = overrideByMonth.get(key);

    const living = override?.isActual
      ? (override?.actualExpenseMinor ?? 0n)
      : (override?.livingExpenseMinor ?? settings.defaultLivingExpenseMinor);
    const isActual = override?.isActual ?? false;

    let income = ctx.payrollIncome;
    let expense = 0n;

    for (const r of ctx.recurring) {
      if (r.endMonthKey && key > r.endMonthKey) continue;
      if (key < r.startMonthKey) continue;

      let triggersThisMonth = false;

      if (r.frequency === "monthly") {
        const [sY, sM] = r.startMonthKey.split("-").map(Number);
        const [cY, cM] = key.split("-").map(Number);
        const startY = sY ?? 0;
        const startM = sM ?? 1;
        const curY = cY ?? 0;
        const curM = cM ?? 1;
        const monthDiff = (curY - startY) * 12 + (curM - startM);
        if (monthDiff >= 0 && monthDiff % r.interval === 0) {
          triggersThisMonth = true;
        }
      } else if (r.frequency === "yearly") {
        const [sY, sM] = r.startMonthKey.split("-").map(Number);
        const [cY, cM] = key.split("-").map(Number);
        const startY = sY ?? 0;
        const curY = cY ?? 0;
        const curM = cM ?? 1;
        const yearDiff = curY - startY;
        if (curM === r.triggerMonthNumber && yearDiff >= 0 && yearDiff % r.interval === 0) {
          triggersThisMonth = true;
        }
      } else if (r.frequency === "weekly") {
        if (r.kind === "income") income += r.amountMinor * 4n;
        else expense += r.amountMinor * 4n;
      } else if (r.frequency === "daily") {
        if (r.kind === "income") income += r.amountMinor * 30n;
        else expense += r.amountMinor * 30n;
      }

      if (triggersThisMonth) {
        if (r.kind === "income") income += r.amountMinor;
        else expense += r.amountMinor;
      }
    }
    for (const inst of ctx.installments) {
      if (inst.remaining == null || i < inst.remaining) expense += inst.amountMinor;
    }
    for (const loan of ctx.loans) {
      const loanAmount = loan.amountAt(i);
      if (loanAmount != null) expense += loanAmount;
    }

    const rsuVestValue = ctx.rsuVestByMonth.get(key) ?? 0n;
    const netCashflow = income - expense - living;
    runningCash += netCashflow;
    runningNetWorth += netCashflow + rsuVestValue;

    months.push({
      month: key,
      livingExpenseMinor: override?.livingExpenseMinor ?? settings.defaultLivingExpenseMinor,
      actualExpenseMinor: override?.actualExpenseMinor,
      isActual,
      scheduledIncomeMinor: income,
      scheduledExpenseMinor: expense,
      rsuVestValueMinor: rsuVestValue,
      netCashflowMinor: netCashflow,
      projectedNetWorthMinor: runningNetWorth,
      projectedCashMinor: runningCash,
    });
  }

  return {
    baseCurrency: settings.currency,
    currentNetWorthMinor: nw.totalMinor,
    currentCashMinor: nw.cashAndBankMinor,
    defaultLivingExpenseMinor: settings.defaultLivingExpenseMinor,
    horizonMonths: settings.horizonMonths,
    livingExpenseCategoryIds: [...(parseCategoryIds(settings.livingExpenseCategoryIds) ?? [])],
    months,
  };
}

/** Living expense = manual expenses not generated by payroll / recurring / installments. */
export async function syncLivingExpenseFromLedger(
  db: Database,
  userId: string,
  monthKey: string,
): Promise<{ livingExpenseMinor: bigint }> {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(y!, m! - 1, 1);
  const end = new Date(y!, m!, 1);

  const settings = await getOrCreateSettings(db, userId);
  const categoryFilter = parseCategoryIds(settings.livingExpenseCategoryIds);

  const txs = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      source: transactions.source,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.occurredAt, start),
        lt(transactions.occurredAt, end),
      ),
    );

  let living = 0n;
  for (const t of txs) {
    if (t.type !== "expense") continue;
    // Only manual expenses count as discretionary living expense.
    if (t.source !== "manual") continue;
    // If specific categories are configured, only count those.
    if (categoryFilter && (!t.categoryId || !categoryFilter.has(t.categoryId))) continue;
    living += t.amountMinor;
  }

  const monthIsoDate = monthIso(start);
  const [existing] = await db
    .select()
    .from(monthlyForecasts)
    .where(and(eq(monthlyForecasts.userId, userId), eq(monthlyForecasts.month, monthIsoDate)))
    .limit(1);

  const estimate = existing ? existing.livingExpenseMinor : settings.defaultLivingExpenseMinor;

  await db
    .insert(monthlyForecasts)
    .values({
      userId,
      month: monthIsoDate,
      livingExpenseMinor: estimate,
      actualExpenseMinor: living,
      isActual: true,
    })
    .onConflictDoUpdate({
      target: [monthlyForecasts.userId, monthlyForecasts.month],
      set: {
        actualExpenseMinor: living,
        isActual: true,
        updatedAt: new Date(),
      },
    });

  return { livingExpenseMinor: living };
}

export async function upsertLivingEstimate(
  db: Database,
  userId: string,
  monthKey: string,
  amountMinor: bigint,
): Promise<void> {
  const [y, m] = monthKey.split("-").map(Number);
  const monthIsoDate = monthIso(new Date(y!, m! - 1, 1));

  await db
    .insert(monthlyForecasts)
    .values({
      userId,
      month: monthIsoDate,
      livingExpenseMinor: amountMinor,
      isActual: false,
    })
    .onConflictDoUpdate({
      target: [monthlyForecasts.userId, monthlyForecasts.month],
      set: {
        livingExpenseMinor: amountMinor,
        isActual: false,
        updatedAt: new Date(),
      },
    });
}

export async function updateForecastSettings(
  db: Database,
  userId: string,
  patch: {
    defaultLivingExpenseMinor?: bigint;
    horizonMonths?: number;
    currency?: string;
    livingExpenseCategoryIds?: string | null;
    includeLendingInNetWorth?: boolean;
  },
): Promise<void> {
  await getOrCreateSettings(db, userId);
  await db
    .update(forecastSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(forecastSettings.userId, userId));
}
