import { type Database, accounts, transactions } from "@acc/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { isLiabilityAccount } from "./accounts";

export interface AccountBalance {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: bigint;
  /** Contribution to net worth (assets positive, liabilities negative). */
  netMinor: bigint;
  isLiability: boolean;
}

/** Compute current balance from opening balance + ledger entries. */
export function applyTransactionToBalance(
  balance: bigint,
  type: string,
  amountMinor: bigint,
  isLiability: boolean,
): bigint {
  if (type === "transfer") return balance;
  if (isLiability) {
    if (type === "expense") return balance + amountMinor;
    if (type === "income") return balance - amountMinor;
    return balance;
  }
  if (type === "income") return balance + amountMinor;
  if (type === "expense") return balance - amountMinor;
  return balance;
}

export async function getAccountBalances(
  db: Database,
  userId: string,
): Promise<AccountBalance[]> {
  // 1. Fetch user accounts and database-level aggregated sums concurrently
  const [userAccounts, outgoingStats, incomingStats] = await Promise.all([
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.archived, false)))
      .orderBy(accounts.createdAt),

    db
      .select({
        accountId: transactions.accountId,
        incomeMinor: sql<bigint>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        expenseMinor: sql<bigint>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
        outTransferMinor: sql<bigint>`coalesce(sum(case when ${transactions.type} = 'transfer' then ${transactions.amountMinor} else 0 end), 0)::bigint`,
      })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(transactions.accountId),

    db
      .select({
        accountId: transactions.transferAccountId,
        inTransferMinor: sql<bigint>`coalesce(sum(coalesce(${transactions.transferAmountMinor}, ${transactions.amountMinor})), 0)::bigint`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "transfer"),
          isNotNull(transactions.transferAccountId),
        ),
      )
      .groupBy(transactions.transferAccountId),
  ]);

  if (userAccounts.length === 0) return [];

  const outgoingMap = new Map(
    outgoingStats.map((s) => [s.accountId, s]),
  );
  const incomingMap = new Map(
    incomingStats.filter((s): s is typeof s & { accountId: string } => Boolean(s.accountId)).map((s) => [s.accountId, s.inTransferMinor]),
  );

  return userAccounts.map((acct) => {
    const isLiability = isLiabilityAccount(acct.type);
    const out = outgoingMap.get(acct.id);
    const inTransfer = BigInt(incomingMap.get(acct.id) ?? 0);

    const incomeSum = BigInt(out?.incomeMinor ?? 0);
    const expenseSum = BigInt(out?.expenseMinor ?? 0);
    const outTransfer = BigInt(out?.outTransferMinor ?? 0);

    let balance = BigInt(acct.openingBalanceMinor ?? 0);

    if (isLiability) {
      // Liabilities (e.g. Credit Card, Loan): expenses and outgoing increase owed amount; income and incoming decrease it
      balance = balance + expenseSum - incomeSum + outTransfer - inTransfer;
    } else {
      // Assets (e.g. Bank, Cash): income and incoming increase balance; expenses and outgoing decrease it
      balance = balance + incomeSum - expenseSum - outTransfer + inTransfer;
    }

    return {
      accountId: acct.id,
      name: acct.name,
      type: acct.type,
      currency: acct.currency,
      balanceMinor: balance,
      netMinor: acct.excludeFromNetWorth ? 0n : (isLiability ? -balance : balance),
      isLiability,
    };
  });
}
