import { type Database, accounts, transactions } from "@acc/db";
import { and, eq } from "drizzle-orm";
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
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.archived, false)))
    .orderBy(accounts.createdAt);

  if (userAccounts.length === 0) return [];

  const txs = await db
    .select({
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const txByAccount = new Map<string, typeof txs>();
  const incomingTransfers = new Map<string, typeof txs>();

  for (const tx of txs) {
    const list = txByAccount.get(tx.accountId) ?? [];
    list.push(tx);
    txByAccount.set(tx.accountId, list);

    if (tx.type === "transfer" && tx.transferAccountId) {
      const incoming = incomingTransfers.get(tx.transferAccountId) ?? [];
      incoming.push(tx);
      incomingTransfers.set(tx.transferAccountId, incoming);
    }
  }

  return userAccounts.map((acct) => {
    const isLiability = isLiabilityAccount(acct.type);
    let balance = acct.openingBalanceMinor;

    for (const tx of txByAccount.get(acct.id) ?? []) {
      if (tx.type === "transfer") {
        balance = isLiability ? balance + tx.amountMinor : balance - tx.amountMinor;
      } else {
        balance = applyTransactionToBalance(balance, tx.type, tx.amountMinor, isLiability);
      }
    }

    for (const tx of incomingTransfers.get(acct.id) ?? []) {
      balance = isLiability
        ? balance - tx.amountMinor
        : balance + tx.amountMinor;
    }
    return {
      accountId: acct.id,
      name: acct.name,
      type: acct.type,
      currency: acct.currency,
      balanceMinor: balance,
      netMinor: isLiability ? -balance : balance,
      isLiability,
    };
  });
}
