import { type Database, installmentSchedules, transactions } from "@acc/db";
import { and, eq, lte } from "drizzle-orm";
import { advanceRecurringDate, initialNextRunDate, parseIsoDate } from "./recurring";
import { todayIsoDate } from "./sync";

export interface GenerateInstallmentsResult {
  processed: number;
  created: number;
}

export async function generateDueInstallments(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GenerateInstallmentsResult> {
  const due = await db
    .select()
    .from(installmentSchedules)
    .where(
      and(eq(installmentSchedules.active, true), lte(installmentSchedules.nextRunDate, asOf)),
    );

  let created = 0;

  for (const schedule of due) {
    if (
      schedule.totalPeriods != null &&
      schedule.completedPeriods >= schedule.totalPeriods
    ) {
      await db
        .update(installmentSchedules)
        .set({ active: false })
        .where(eq(installmentSchedules.id, schedule.id));
      continue;
    }

    let runDate = schedule.nextRunDate;
    const monthly = {
      frequency: "monthly" as const,
      interval: 1,
      dayOfMonth: schedule.dayOfMonth,
      weekday: null,
    };

    let completed = schedule.completedPeriods;

    while (runDate <= asOf) {
      if (schedule.totalPeriods != null && completed >= schedule.totalPeriods) break;

      await db.insert(transactions).values({
        userId: schedule.userId,
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
        type: "expense",
        amountMinor: schedule.amountMinor,
        currency: schedule.currency,
        occurredAt: parseIsoDate(runDate),
        note: schedule.note ?? schedule.name,
        installmentScheduleId: schedule.id,
      });
      created += 1;
      completed += 1;

      runDate = advanceRecurringDate(runDate, monthly);
    }

    const done =
      schedule.totalPeriods != null && completed >= schedule.totalPeriods;

    await db
      .update(installmentSchedules)
      .set({
        nextRunDate: runDate,
        completedPeriods: completed,
        active: done ? false : schedule.active,
      })
      .where(eq(installmentSchedules.id, schedule.id));
  }

  return { processed: due.length, created };
}

export function firstInstallmentDate(dayOfMonth: number, anchor?: string): string {
  return initialNextRunDate(anchor ?? todayIsoDate(), {
    frequency: "monthly",
    interval: 1,
    dayOfMonth,
    weekday: null,
  });
}
