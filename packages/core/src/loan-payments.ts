import { type Database, loanPaymentSchedules, transactions } from "@acc/db";
import { and, eq, lte } from "drizzle-orm";
import { advanceRecurringDate, initialNextRunDate, parseIsoDate } from "./recurring";
import { todayIsoDate } from "./sync";

export interface GenerateLoanPaymentsResult {
  processed: number;
  created: number;
}

export async function generateDueLoanPayments(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GenerateLoanPaymentsResult> {
  const due = await db
    .select()
    .from(loanPaymentSchedules)
    .where(
      and(eq(loanPaymentSchedules.active, true), lte(loanPaymentSchedules.nextRunDate, asOf)),
    );

  let created = 0;

  for (const schedule of due) {
    let runDate = schedule.nextRunDate;
    const monthly = {
      frequency: "monthly" as const,
      interval: 1,
      dayOfMonth: schedule.dayOfMonth,
      weekday: null,
    };

    while (runDate <= asOf) {
      await db.insert(transactions).values({
        userId: schedule.userId,
        accountId: schedule.sourceAccountId,
        transferAccountId: schedule.liabilityAccountId,
        type: "transfer",
        amountMinor: schedule.amountMinor,
        currency: schedule.currency,
        occurredAt: parseIsoDate(runDate),
        note: schedule.note ?? schedule.name,
      });
      created += 1;
      runDate = advanceRecurringDate(runDate, monthly);
    }

    await db
      .update(loanPaymentSchedules)
      .set({ nextRunDate: runDate })
      .where(eq(loanPaymentSchedules.id, schedule.id));
  }

  return { processed: due.length, created };
}

export function firstLoanPaymentDate(dayOfMonth: number, anchor?: string): string {
  return initialNextRunDate(anchor ?? todayIsoDate(), {
    frequency: "monthly",
    interval: 1,
    dayOfMonth,
    weekday: null,
  });
}
