import {
  type Database,
  installmentSchedules,
  loanPaymentSchedules,
  loanPaymentTiers,
  payrollLines,
  payrollProfiles,
  recurringRules,
  rsuGrants,
  rsuVests,
} from "@acc/db";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { amountForPeriod } from "./loan-payments";
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
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
    if (r.nextRunDate <= end) {
      items.push({
        date: r.nextRunDate,
        name: r.name,
        kind: r.kind,
        amountMinor: r.amountMinor,
        currency: r.currency,
      });
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
      if (p.nextRunDate <= end) {
        items.push({
          date: p.nextRunDate,
          name: p.name,
          kind: "income",
          amountMinor: sumPayrollLines(byProfile.get(p.id) ?? []).netMinor,
          currency: p.currency,
        });
      }
    }
  }

  const installments = await db
    .select()
    .from(installmentSchedules)
    .where(and(eq(installmentSchedules.userId, userId), eq(installmentSchedules.active, true)));
  for (const i of installments) {
    if (i.nextRunDate <= end) {
      items.push({
        date: i.nextRunDate,
        name: i.name,
        kind: "expense",
        amountMinor: i.amountMinor,
        currency: i.currency,
      });
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
    for (const l of loans) {
      if (l.nextRunDate <= end) {
        const tiers = (tiersBySchedule.get(l.id) ?? []).map((t) => ({
          fromPeriod: t.fromPeriod,
          toPeriod: t.toPeriod,
          amountMinor: t.amountMinor,
        }));
        items.push({
          date: l.nextRunDate,
          name: l.name,
          kind: "transfer",
          amountMinor: amountForPeriod(l.completedPeriods + 1, tiers, l.amountMinor),
          currency: l.currency,
          note: "貸款還款",
        });
      }
    }
  }

  const vests = await db
    .select({
      vestDate: rsuVests.vestDate,
      quantity: rsuVests.quantity,
      name: rsuGrants.name,
      symbol: rsuGrants.symbol,
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
    items.push({
      date: v.vestDate,
      name: `${v.name}（${v.symbol}）`,
      kind: "rsu",
      amountMinor: 0n,
      currency: "",
      note: `${v.quantity} 股`,
    });
  }

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}
