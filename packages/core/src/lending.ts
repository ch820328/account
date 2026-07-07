export type LoanLedgerKind = "lend" | "collect" | "borrow" | "repay";

/**
 * Signed contribution of an entry to the per-counterparty balance, where a
 * positive balance means "they still owe me" and negative means "I owe them".
 *   lend   (我借出給對方)   → +  (they owe me more)
 *   collect(對方還我)       → −  (they owe me less)
 *   borrow (我向對方借)     → −  (I owe them more)
 *   repay  (我還對方)       → +  (I owe them less)
 */
export function signedLedgerAmount(kind: LoanLedgerKind, amountMinor: bigint): bigint {
  switch (kind) {
    case "lend":
    case "repay":
      return amountMinor;
    case "collect":
    case "borrow":
      return -amountMinor;
  }
}
