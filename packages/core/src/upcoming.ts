import {
  type Database,
  forecastSettings,
  installmentSchedules,
  loanPaymentSchedules,
  loanPaymentTiers,
  loanRateAdjustments,
  payrollLines,
  payrollProfiles,
  recurringRules,
  rsuGrants,
  rsuVests,
} from "@acc/db";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { amountForPeriod, calculateNextLoanPaymentAmount } from "./loan-payments";
import { getAccountBalances } from "./balances";
import { sumPayrollLines } from "./payroll";
import { todayIsoDate } from "./sync";

export type UpcomingKind = "income" | "expense" | "transfer" | "rsu";

export interface UpcomingItem {
  date: string;
  name: string;
  kind: UpcomingKind;
  amountMinor: bigint;
  currency: string;
  note?: string;
  sourceAccountId?: string;
  transferAccountId?: string;
  categoryId?: string;
  ruleId?: string;
  autoCommit?: boolean;
  paid?: boolean;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

function computeNextDateIso(
  currentIso: string,
  frequency: string,
  interval = 1,
  targetDayOfMonth?: number | null
): string {
  if (!currentIso || currentIso.length < 10) return "9999-12-31";
  const d = new Date(`${currentIso}T00:00:00`);
  if (isNaN(d.getTime())) return "9999-12-31";

  const safeInterval = Math.max(1, interval || 1);

  if (frequency === "yearly") {
    d.setFullYear(d.getFullYear() + safeInterval);
  } else if (frequency === "monthly") {
    const targetDay = targetDayOfMonth ?? d.getDate();
    d.setMonth(d.getMonth() + safeInterval, 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, daysInMonth));
  } else if (frequency === "weekly") {
    d.setDate(d.getDate() + 7 * safeInterval);
  } else if (frequency === "daily") {
    d.setDate(d.getDate() + safeInterval);
  } else {
    d.setMonth(d.getMonth() + 1);
  }

  const result = formatIsoDate(d);
  if (result <= currentIso) {
    const fallback = new Date(`${currentIso}T00:00:00`);
    fallback.setDate(fallback.getDate() + 1);
    return formatIsoDate(fallback);
  }
  return result;
}

/** Next occurrence of each active schedule within the next `days` days. */
export async function upcomingScheduled(
  db: Database,
  userId: string,
  days = 30,
): Promise<UpcomingItem[]> {
  const today = todayIsoDate();
  const end = addDaysIso(today, days);
  const items: UpcomingItem[] = [];

  const rules = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true)));
  for (const r of rules) {
    let curDate = r.nextRunDate;
    while (curDate <= end) {
      if (r.endDate && curDate > r.endDate) break;
      items.push({
        date: curDate,
        name: r.name,
        kind: r.kind,
        amountMinor: r.amountMinor,
        currency: r.currency,
        sourceAccountId: (r.kind === "expense" || r.kind === "transfer") ? r.accountId : undefined,
        transferAccountId: r.transferAccountId || undefined,
        categoryId: r.categoryId || undefined,
        ruleId: r.id,
        autoCommit: r.autoCommit,
      });
      curDate = computeNextDateIso(curDate, r.frequency, r.interval || 1, r.dayOfMonth);
    }
  }

  const profiles = await db
    .select()
    .from(payrollProfiles)
    .where(and(eq(payrollProfiles.userId, userId), eq(payrollProfiles.active, true)));
  if (profiles.length) {
    const lines = await db
      .select()
      .from(payrollLines)
      .where(inArray(payrollLines.profileId, profiles.map((p) => p.id)));
    const byProfile = new Map<string, typeof lines>();
    for (const l of lines) {
      const list = byProfile.get(l.profileId);
      if (list) list.push(l);
      else byProfile.set(l.profileId, [l]);
    }
    for (const p of profiles) {
      let curDate = p.nextRunDate;
      while (curDate <= end) {
        items.push({
          date: curDate,
          name: p.name,
          kind: "income",
          amountMinor: sumPayrollLines(byProfile.get(p.id) ?? []).netMinor,
          currency: p.currency,
        });
        curDate = computeNextDateIso(curDate, "monthly", 1, p.dayOfMonth);
      }
    }
  }

  const installments = await db
    .select()
    .from(installmentSchedules)
    .where(and(eq(installmentSchedules.userId, userId), eq(installmentSchedules.active, true)));
  for (const i of installments) {
    let curDate = i.nextRunDate;
    let completed = i.completedPeriods;
    const total = i.totalPeriods;
    while (curDate <= end) {
      if (total != null && completed >= total) break;
      items.push({
        date: curDate,
        name: i.name,
        kind: "expense",
        amountMinor: i.amountMinor,
        currency: i.currency,
        sourceAccountId: i.accountId,
        categoryId: i.categoryId || undefined,
      });
      completed++;
      curDate = computeNextDateIso(curDate, "monthly", 1, i.dayOfMonth);
    }
  }

  const loans = await db
    .select()
    .from(loanPaymentSchedules)
    .where(and(eq(loanPaymentSchedules.userId, userId), eq(loanPaymentSchedules.active, true)));
  if (loans.length) {
    const tierRows = await db
      .select()
      .from(loanPaymentTiers)
      .where(inArray(loanPaymentTiers.scheduleId, loans.map((l) => l.id)));
    const tiersBySchedule = new Map<string, typeof tierRows>();
    for (const t of tierRows) {
      const list = tiersBySchedule.get(t.scheduleId);
      if (list) list.push(t);
      else tiersBySchedule.set(t.scheduleId, [t]);
    }
    
    const adjustmentRows = await db
      .select()
      .from(loanRateAdjustments)
      .where(inArray(loanRateAdjustments.scheduleId, loans.map((l) => l.id)));
    const adjustmentsBySchedule = new Map<string, typeof adjustmentRows>();
    for (const a of adjustmentRows) {
      const list = adjustmentsBySchedule.get(a.scheduleId);
      if (list) list.push(a);
      else adjustmentsBySchedule.set(a.scheduleId, [a]);
    }

    const [settings] = await db
      .select({ loanBaseRate: forecastSettings.loanBaseRate })
      .from(forecastSettings)
      .where(eq(forecastSettings.userId, userId))
      .limit(1);
    const baseRate = Number(settings?.loanBaseRate ?? "1.85");

    const balances = await getAccountBalances(db, userId);

    for (const l of loans) {
      let curDate = l.nextRunDate;
      let completed = l.completedPeriods;
      const total = l.totalPeriods;
      const tiers = (tiersBySchedule.get(l.id) ?? []).map((t) => ({
        fromPeriod: t.fromPeriod,
        toPeriod: t.toPeriod,
        amountMinor: t.amountMinor,
        rateMargin: t.rateMargin,
        isGracePeriod: t.isGracePeriod,
      }));
      
      const adjustments = adjustmentsBySchedule.get(l.id) ?? [];
      const acctBalance = balances.find(b => b.accountId === l.liabilityAccountId);
      const currentOwed = acctBalance ? (acctBalance.balanceMinor * -1n) : 0n;

      while (curDate <= end) {
        if (total != null && completed >= total) break;
        items.push({
          date: curDate,
          name: l.name,
          kind: "expense",
          amountMinor: calculateNextLoanPaymentAmount(l, tiers, adjustments, currentOwed, baseRate, completed + 1),
          currency: l.currency,
          note: "貸款還款",
          sourceAccountId: l.sourceAccountId,
        });
        completed++;
        curDate = computeNextDateIso(curDate, "monthly", 1, l.dayOfMonth);
      }
    }
  }

  const vests = await db
    .select({
      vestDate: rsuVests.vestDate,
      quantity: rsuVests.quantity,
      name: rsuGrants.name,
      symbol: rsuGrants.symbol,
      market: rsuGrants.market,
      estimatedPrice: rsuGrants.estimatedPrice,
      brokerAccountId: rsuGrants.brokerAccountId,
    })
    .from(rsuVests)
    .innerJoin(rsuGrants, eq(rsuVests.grantId, rsuGrants.id))
    .where(
      and(
        eq(rsuGrants.userId, userId),
        eq(rsuGrants.active, true),
        eq(rsuVests.status, "pending"),
        lte(rsuVests.vestDate, end),
      ),
    )
    .orderBy(asc(rsuVests.vestDate));
  // Only the earliest pending vest per grant within the window.
  const seenGrant = new Set<string>();
  for (const v of vests) {
    if (seenGrant.has(v.name)) continue;
    seenGrant.add(v.name);
    const price = Number(v.estimatedPrice ?? 0);
    const qty = Number(v.quantity ?? 0);
    const amountMinor = BigInt(Math.round(price * qty * 100));
    const curr = v.market === "TW" ? "TWD" : "USD";
    items.push({
      date: v.vestDate,
      name: `${v.name}（${v.symbol}）`,
      kind: "rsu",
      amountMinor,
      currency: curr,
      sourceAccountId: v.brokerAccountId ?? undefined,
      note: price > 0 ? `${v.quantity} 股（預估 $${price}/股）` : `${v.quantity} 股`,
    });
  }

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}
