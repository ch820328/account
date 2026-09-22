import { describe, expect, it } from "vitest";
import {
  accounts,
  db,
  installmentSchedules,
  loanPaymentSchedules,
  loanPaymentTiers,
  payrollLines,
  payrollProfiles,
  transactions,
  user,
  forecastSettings,
} from "@acc/db";
import { eq } from "drizzle-orm";
import { generateDueInstallments } from "./installments";
import { generateDueLoanPayments } from "./loan-payments";
import { generateDuePayrolls } from "./payroll";

const RUN = process.env.RUN_DB_TESTS === "1";

async function makeUser(prefix: string) {
  const uid = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.insert(user).values({
    id: uid,
    name: "t",
    email: `${uid}@test.local`,
    emailVerified: true,
  });
  return uid;
}

describe.skipIf(!RUN)("schedule generators (integration)", () => {
  it("payroll posts one income+deduction row per period", async () => {
    const uid = await makeUser("pay");
    try {
      const [acct] = await db
        .insert(accounts)
        .values({ userId: uid, name: "Salary", type: "bank", currency: "TWD" })
        .returning();
      const [profile] = await db
        .insert(payrollProfiles)
        .values({
          userId: uid,
          name: "月薪",
          depositAccountId: acct!.id,
          currency: "TWD",
          dayOfMonth: 25,
          nextRunDate: "2020-01-25",
        })
        .returning();
      await db.insert(payrollLines).values([
        { profileId: profile!.id, name: "本薪", kind: "earning", amountMinor: 5000000n, sortOrder: 0 },
        { profileId: profile!.id, name: "勞保", kind: "deduction", amountMinor: 100000n, sortOrder: 1 },
      ]);

      const res = await generateDuePayrolls(db, "2020-02-01");
      expect(res.created).toBe(2); // one month, two lines
      const txs = await db.select().from(transactions).where(eq(transactions.userId, uid));
      expect(txs.every((t) => t.source === "payroll")).toBe(true);
      expect(txs.some((t) => t.type === "income")).toBe(true);
      expect(txs.some((t) => t.type === "expense")).toBe(true);
    } finally {
      await db.delete(user).where(eq(user.id, uid));
    }
  });

  it("installment stops and deactivates after totalPeriods", async () => {
    const uid = await makeUser("inst");
    try {
      const [acct] = await db
        .insert(accounts)
        .values({ userId: uid, name: "Card", type: "bank", currency: "TWD" })
        .returning();
      const [sched] = await db
        .insert(installmentSchedules)
        .values({
          userId: uid,
          name: "手機分期",
          accountId: acct!.id,
          amountMinor: 100000n,
          currency: "TWD",
          dayOfMonth: 1,
          nextRunDate: "2020-01-01",
          totalPeriods: 2,
        })
        .returning();

      const res = await generateDueInstallments(db, "2020-12-01");
      expect(res.created).toBe(2); // capped at totalPeriods
      const [after] = await db
        .select()
        .from(installmentSchedules)
        .where(eq(installmentSchedules.id, sched!.id));
      expect(after!.completedPeriods).toBe(2);
      expect(after!.active).toBe(false);
    } finally {
      await db.delete(user).where(eq(user.id, uid));
    }
  });

  it("loan uses tiered amount for the grace period", async () => {
    const uid = await makeUser("loan");
    try {
      const [liab] = await db
        .insert(accounts)
        .values({ userId: uid, name: "房貸", type: "loan", currency: "TWD", openingBalanceMinor: 10000000n })
        .returning();
      const [src] = await db
        .insert(accounts)
        .values({ userId: uid, name: "Bank", type: "bank", currency: "TWD" })
        .returning();
      const [sched] = await db
        .insert(loanPaymentSchedules)
        .values({
          userId: uid,
          name: "新青安",
          liabilityAccountId: liab!.id,
          sourceAccountId: src!.id,
          amountMinor: 2800000n,
          currency: "TWD",
          dayOfMonth: 1,
          nextRunDate: "2020-01-01",
          totalPeriods: 3,
        })
        .returning();
      await db.insert(loanPaymentTiers).values({
        scheduleId: sched!.id,
        fromPeriod: 1,
        toPeriod: 1,
        amountMinor: 1500000n,
      });

      const res = await generateDueLoanPayments(db, "2020-06-01");
      expect(res.created).toBe(3);
      const txs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, uid));
      const amounts = txs.map((t) => t.amountMinor).sort((a, b) => (a < b ? -1 : 1));
      expect(amounts).toEqual([1500000n, 2800000n, 2800000n]);
    } finally {
      await db.delete(user).where(eq(user.id, uid));
    }
  });

  it("loan calculates equal_principal_interest amortization dynamically", async () => {
    const uid = await makeUser("loan-amort");
    try {
      // Set base rate in forecast settings
      await db.insert(forecastSettings).values({
        userId: uid,
        loanBaseRate: "1.85",
        currency: "TWD",
      });

      const [liab] = await db
        .insert(accounts)
        .values({ userId: uid, name: "房貸", type: "loan", currency: "TWD", openingBalanceMinor: 800000000n })
        .returning();
      const [src] = await db
        .insert(accounts)
        .values({ userId: uid, name: "Bank", type: "bank", currency: "TWD" })
        .returning();
      const [sched] = await db
        .insert(loanPaymentSchedules)
        .values({
          userId: uid,
          name: "新青安機動",
          liabilityAccountId: liab!.id,
          sourceAccountId: src!.id,
          amountMinor: 0n,
          currency: "TWD",
          dayOfMonth: 1,
          nextRunDate: "2020-01-01",
          totalPeriods: 240,
          amortizationMethod: "equal_principal_interest",
          rateMargin: "0.35", // Total rate = 1.85 + 0.35 = 2.20%
        })
        .returning();

      const res = await generateDueLoanPayments(db, "2020-01-02");
      expect(res.created).toBe(1); // 1 period generated

      const txs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, uid));

      const transferTx = txs.find((t) => t.type === "transfer");
      const interestTx = txs.find((t) => t.type === "expense");

      expect(transferTx).toBeDefined();
      expect(interestTx).toBeDefined();

      // Math verification:
      // P = 800,000,000 cents. R = 2.2% = 0.022. monthly r = 0.022 / 12. N = 240.
      // interest = P * r = 800,000,000 * 0.022 / 12 = 1,466,666.66... => 1466667 cents
      // PMT = P * r * (1+r)^N / ((1+r)^N - 1) => 4,123,278 cents
      expect(Number(transferTx!.amountMinor)).toBe(4123278);
      expect(Number(interestTx!.amountMinor)).toBe(1466667);
    } finally {
      await db.delete(user).where(eq(user.id, uid));
    }
  });

  it("loan calculates equal_principal amortization dynamically", async () => {
    const uid = await makeUser("loan-eqpr");
    try {
      // Set base rate in forecast settings
      await db.insert(forecastSettings).values({
        userId: uid,
        loanBaseRate: "1.85",
        currency: "TWD",
      });

      const [liab] = await db
        .insert(accounts)
        .values({ userId: uid, name: "房貸", type: "loan", currency: "TWD", openingBalanceMinor: 800000000n })
        .returning();
      const [src] = await db
        .insert(accounts)
        .values({ userId: uid, name: "Bank", type: "bank", currency: "TWD" })
        .returning();
      const [sched] = await db
        .insert(loanPaymentSchedules)
        .values({
          userId: uid,
          name: "新青安等額本金",
          liabilityAccountId: liab!.id,
          sourceAccountId: src!.id,
          amountMinor: 0n,
          currency: "TWD",
          dayOfMonth: 1,
          nextRunDate: "2020-01-01",
          totalPeriods: 240,
          amortizationMethod: "equal_principal",
          rateMargin: "0.35", // Total rate = 1.85 + 0.35 = 2.20%
        })
        .returning();

      const res = await generateDueLoanPayments(db, "2020-01-02");
      expect(res.created).toBe(1); // 1 period generated

      const txs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, uid));

      const transferTx = txs.find((t) => t.type === "transfer");
      const interestTx = txs.find((t) => t.type === "expense");

      expect(transferTx).toBeDefined();
      expect(interestTx).toBeDefined();

      // Math verification:
      // P = 800,000,000 cents. R = 2.2% = 0.022. monthly r = 0.022 / 12. N = 240.
      // principal portion = P / N = 800,000,000 / 240 = 3,333,333 cents
      // interest portion = P * r = 800,000,000 * 0.022 / 12 = 1,466,667 cents
      // PMT = principal portion + interest portion = 3333333 + 1466667 = 4800000 cents
      expect(Number(transferTx!.amountMinor)).toBe(4800000);
      expect(Number(interestTx!.amountMinor)).toBe(1466667);
    } finally {
      await db.delete(user).where(eq(user.id, uid));
    }
  });
});
