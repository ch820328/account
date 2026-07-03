import { type Database, payrollLines, payrollProfiles, transactions } from "@acc/db";
import { and, eq, lte } from "drizzle-orm";
import {
  advanceRecurringDate,
  initialNextRunDate,
  parseIsoDate,
} from "./recurring";
import { todayIsoDate } from "./sync";

export interface PayrollTotals {
  earningsMinor: bigint;
  deductionsMinor: bigint;
  netMinor: bigint;
}

export function sumPayrollLines(
  lines: { kind: string; amountMinor: bigint }[],
): PayrollTotals {
  let earningsMinor = 0n;
  let deductionsMinor = 0n;
  for (const line of lines) {
    if (line.kind === "earning") earningsMinor += line.amountMinor;
    else deductionsMinor += line.amountMinor;
  }
  return { earningsMinor, deductionsMinor, netMinor: earningsMinor - deductionsMinor };
}

export interface GeneratePayrollResult {
  processed: number;
  created: number;
}

export async function generateDuePayrolls(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GeneratePayrollResult> {
  const due = await db
    .select()
    .from(payrollProfiles)
    .where(and(eq(payrollProfiles.active, true), lte(payrollProfiles.nextRunDate, asOf)));

  let created = 0;

  for (const profile of due) {
    const lines = await db
      .select()
      .from(payrollLines)
      .where(eq(payrollLines.profileId, profile.id))
      .orderBy(payrollLines.sortOrder);

    let runDate = profile.nextRunDate;
    const schedule = {
      frequency: "monthly" as const,
      interval: 1,
      dayOfMonth: profile.dayOfMonth,
      weekday: null,
    };

    while (runDate <= asOf) {
      const occurredAt = parseIsoDate(runDate);
      const label = profile.name;

      for (const line of lines) {
        await db.insert(transactions).values({
          userId: profile.userId,
          accountId: profile.depositAccountId,
          categoryId: line.categoryId,
          type: line.kind === "earning" ? "income" : "expense",
          amountMinor: line.amountMinor,
          currency: profile.currency,
          occurredAt,
          note: `${label} · ${line.name}`,
        });
        created += 1;
      }

      runDate = advanceRecurringDate(runDate, schedule);
    }

    await db
      .update(payrollProfiles)
      .set({ nextRunDate: runDate })
      .where(eq(payrollProfiles.id, profile.id));
  }

  return { processed: due.length, created };
}

export function firstPayrollRunDate(dayOfMonth: number, anchor?: string): string {
  const anchorDate = anchor ?? todayIsoDate();
  return initialNextRunDate(anchorDate, {
    frequency: "monthly",
    interval: 1,
    dayOfMonth,
    weekday: null,
  });
}
