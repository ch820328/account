import { type Database, netWorthSnapshots, user } from "@acc/db";
import { computeNetWorth } from "./net-worth";
import { todayIsoDate } from "./sync";

/**
 * Record a daily net-worth snapshot for every user, powering trend charts.
 * Idempotent per (user, date) — re-running the same day overwrites.
 */
export async function snapshotAllUsersNetWorth(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<{ users: number }> {
  const users = await db.select({ id: user.id }).from(user);

  for (const u of users) {
    const nw = await computeNetWorth(db, u.id);
    await db
      .insert(netWorthSnapshots)
      .values({
        userId: u.id,
        asOf,
        currency: nw.baseCurrency,
        totalMinor: nw.totalMinor,
        assetsMinor: nw.assetsMinor,
        liabilitiesMinor: nw.liabilitiesMinor,
        cashAndBankMinor: nw.cashAndBankMinor,
        investmentsMinor: nw.investmentsMinor,
      })
      .onConflictDoUpdate({
        target: [netWorthSnapshots.userId, netWorthSnapshots.asOf],
        set: {
          currency: nw.baseCurrency,
          totalMinor: nw.totalMinor,
          assetsMinor: nw.assetsMinor,
          liabilitiesMinor: nw.liabilitiesMinor,
          cashAndBankMinor: nw.cashAndBankMinor,
          investmentsMinor: nw.investmentsMinor,
        },
      });
  }

  return { users: users.length };
}
