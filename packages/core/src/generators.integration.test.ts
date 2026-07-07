import { describe, expect, it } from "vitest";
import { accounts, db, recurringRules, transactions, user } from "@acc/db";
import { eq } from "drizzle-orm";
import { generateDueRecurringTransactions } from "./recurring";

// Only runs when a real database is available (CI sets RUN_DB_TESTS=1 and
// DATABASE_URL). Skipped in the default unit-test run.
const RUN = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN)("recurring generator (integration)", () => {
  it("posts a due monthly rule atomically and advances next run", async () => {
    const uid = `test-${Date.now()}`;
    await db.insert(user).values({
      id: uid,
      name: "test",
      email: `${uid}@test.local`,
      emailVerified: true,
    });

    const [acct] = await db
      .insert(accounts)
      .values({ userId: uid, name: "Bank", type: "bank", currency: "TWD" })
      .returning();

    const [rule] = await db
      .insert(recurringRules)
      .values({
        userId: uid,
        name: "Rent",
        kind: "expense",
        accountId: acct!.id,
        amountMinor: 100000n,
        currency: "TWD",
        frequency: "monthly",
        interval: 1,
        dayOfMonth: 1,
        anchorDate: "2020-01-01",
        nextRunDate: "2020-01-01",
      })
      .returning();

    try {
      const res = await generateDueRecurringTransactions(db, "2020-03-05");
      expect(res.created).toBeGreaterThan(0);

      const txs = await db
        .select()
        .from(transactions)
        .where(eq(transactions.recurringRuleId, rule!.id));
      expect(txs.length).toBe(res.created);
      expect(txs.every((t) => t.source === "recurring")).toBe(true);

      const [after] = await db
        .select({ nextRunDate: recurringRules.nextRunDate })
        .from(recurringRules)
        .where(eq(recurringRules.id, rule!.id));
      expect(after!.nextRunDate > "2020-03-05").toBe(true);
    } finally {
      // Cascades to accounts, rules, and transactions.
      await db.delete(user).where(eq(user.id, uid));
    }
  });
});
