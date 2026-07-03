import { type Database, recurringRules, transactions } from "@acc/db";
import { and, eq, lte } from "drizzle-orm";
import { todayIsoDate } from "./sync";

export function parseIsoDate(iso: string): Date {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Frequency = "daily" | "weekly" | "monthly" | "yearly";

interface RecurringSchedule {
  frequency: Frequency;
  interval: number;
  dayOfMonth: number | null;
  weekday: number | null;
}

/** Advance one occurrence from a given date (exclusive of `from`). */
export function advanceRecurringDate(from: string, schedule: RecurringSchedule): string {
  const d = parseIsoDate(from);
  const interval = schedule.interval || 1;

  switch (schedule.frequency) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly": {
      const target = schedule.weekday ?? d.getDay();
      d.setDate(d.getDate() + 7 * interval);
      const diff = (target - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      break;
    }
    case "monthly": {
      d.setMonth(d.getMonth() + interval);
      const dom = schedule.dayOfMonth ?? d.getDate();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(dom, lastDay));
      break;
    }
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }

  return formatIsoDate(d);
}

/** First run on or after anchor date. */
export function initialNextRunDate(
  anchorDate: string,
  schedule: RecurringSchedule,
): string {
  const anchor = parseIsoDate(anchorDate);
  if (schedule.frequency === "monthly" && schedule.dayOfMonth) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), schedule.dayOfMonth);
    if (d < anchor) d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(schedule.dayOfMonth, lastDay));
    return formatIsoDate(d);
  }
  if (schedule.frequency === "weekly" && schedule.weekday != null) {
    const d = new Date(anchor);
    const diff = (schedule.weekday - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return formatIsoDate(d);
  }
  return anchorDate;
}

export interface GenerateRecurringResult {
  processed: number;
  created: number;
}

/** Insert due recurring transactions and advance next_run_date. */
export async function generateDueRecurringTransactions(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GenerateRecurringResult> {
  const due = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.active, true), lte(recurringRules.nextRunDate, asOf)));

  let created = 0;

  for (const rule of due) {
    if (rule.endDate && rule.endDate < asOf) {
      await db
        .update(recurringRules)
        .set({ active: false })
        .where(eq(recurringRules.id, rule.id));
      continue;
    }

    let runDate = rule.nextRunDate;
    const schedule: RecurringSchedule = {
      frequency: rule.frequency,
      interval: rule.interval,
      dayOfMonth: rule.dayOfMonth,
      weekday: rule.weekday,
    };

    while (runDate <= asOf) {
      if (rule.endDate && runDate > rule.endDate) break;

      await db.insert(transactions).values({
        userId: rule.userId,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        type: rule.kind,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        occurredAt: parseIsoDate(runDate),
        note: rule.note ?? rule.name,
        recurringRuleId: rule.id,
      });
      created += 1;

      runDate = advanceRecurringDate(runDate, schedule);
    }

    await db
      .update(recurringRules)
      .set({ nextRunDate: runDate })
      .where(eq(recurringRules.id, rule.id));
  }

  return { processed: due.length, created };
}
