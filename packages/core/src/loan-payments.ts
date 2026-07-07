import {
  type Database,
  loanPaymentSchedules,
  loanPaymentTiers,
  transactions,
} from "@acc/db";
import { and, eq, inArray, lte } from "drizzle-orm";
import { advanceRecurringDate, initialNextRunDate, parseIsoDate } from "./recurring";
import { todayIsoDate } from "./sync";

export interface GenerateLoanPaymentsResult {
  processed: number;
  created: number;
}

export interface LoanTier {
  fromPeriod: number;
  toPeriod: number;
  amountMinor: bigint;
}

/**
 * Pick the payment amount for a given 1-based period from the tier ranges,
 * falling back to the schedule's default amount when nothing matches.
 */
export function amountForPeriod(
  period: number,
  tiers: LoanTier[],
  fallbackMinor: bigint,
): bigint {
  for (const tier of tiers) {
    if (period >= tier.fromPeriod && period <= tier.toPeriod) return tier.amountMinor;
  }
  return fallbackMinor;
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
  if (due.length === 0) return { processed: 0, created: 0 };

  const allTiers = await db
    .select()
    .from(loanPaymentTiers)
    .where(inArray(loanPaymentTiers.scheduleId, due.map((s) => s.id)));

  const tiersBySchedule = new Map<string, LoanTier[]>();
  for (const t of allTiers) {
    const list = tiersBySchedule.get(t.scheduleId) ?? [];
    list.push({ fromPeriod: t.fromPeriod, toPeriod: t.toPeriod, amountMinor: t.amountMinor });
    tiersBySchedule.set(t.scheduleId, list);
  }

  for (const schedule of due) {
    const tiers = tiersBySchedule.get(schedule.id) ?? [];
    const monthly = {
      frequency: "monthly" as const,
      interval: 1,
      dayOfMonth: schedule.dayOfMonth,
      weekday: null,
    };

    await db.transaction(async (tx) => {
      let runDate = schedule.nextRunDate;
      let completed = schedule.completedPeriods;

      while (runDate <= asOf) {
        if (schedule.totalPeriods != null && completed >= schedule.totalPeriods) break;

        const period = completed + 1;
        const amountMinor = amountForPeriod(period, tiers, schedule.amountMinor);

        await tx.insert(transactions).values({
          userId: schedule.userId,
          accountId: schedule.sourceAccountId,
          transferAccountId: schedule.liabilityAccountId,
          type: "transfer",
          amountMinor,
          currency: schedule.currency,
          occurredAt: parseIsoDate(runDate),
          note: schedule.note ?? schedule.name,
          source: "loan",
        });
        created += 1;
        completed += 1;
        runDate = advanceRecurringDate(runDate, monthly);
      }

      const done = schedule.totalPeriods != null && completed >= schedule.totalPeriods;
      await tx
        .update(loanPaymentSchedules)
        .set({
          nextRunDate: runDate,
          completedPeriods: completed,
          active: done ? false : schedule.active,
        })
        .where(eq(loanPaymentSchedules.id, schedule.id));
    });
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
