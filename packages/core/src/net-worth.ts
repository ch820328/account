import {
  type Database,
  accounts,
  forecastSettings,
  fxRates,
  holdings,
  instruments,
  loanLedgerEntries,
  priceSnapshots,
  recurringRules,
  transactions,
} from "@acc/db";
import { convert, fromDecimal, money, multiply } from "@acc/money";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getAccountBalances } from "./balances";
import { getBaseCurrency } from "./currency";
import { signedLedgerAmount, type LoanLedgerKind } from "./lending";

export interface NetWorthBreakdown {
  baseCurrency: string;
  totalMinor: bigint;
  assetsMinor: bigint;
  liabilitiesMinor: bigint;
  cashAndBankMinor: bigint;
  investmentsMinor: bigint;
  /** Personal lending ledger, when included in net worth (else 0). */
  receivableMinor: bigint;
  payableMinor: bigint;
  accounts: {
    accountId: string;
    name: string;
    type: string;
    currency: string;
    balanceMinor: bigint;
    netMinorBase: bigint;
    isLiability: boolean;
  }[];
  holdings: {
    id: string;
    symbol: string;
    market: string;
    name: string;
    quantity: string;
    currency: string;
    price: string | null;
    marketValueMinor: bigint | null;
    marketValueBaseMinor: bigint | null;
    accountName: string | null;
  }[];
  monthlyCashflow: {
    currency: string;
    incomeMinor: bigint;
    expenseMinor: bigint;
    netMinor: bigint;
    projectedIncomeMinor: bigint;
    projectedExpenseMinor: bigint;
    netBaseMinor: bigint;
  }[];
}

export async function latestFxRates(db: Database): Promise<Map<string, string>> {
  const base = getBaseCurrency();
  const rows = await db.select().from(fxRates).orderBy(desc(fxRates.asOf));

  const map = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.base.toUpperCase()}_${row.quote.toUpperCase()}`;
    if (!map.has(key)) map.set(key, row.rate);
  }
  map.set(`${base}_${base}`, "1");
  return map;
}

export function fxRateToBase(
  currency: string,
  base: string,
  rates: Map<string, string>,
): string | null {
  const c = currency.toUpperCase();
  if (c === base) return "1";
  const direct = rates.get(`${c}_${base}`);
  if (direct) return direct;
  const inverse = rates.get(`${base}_${c}`);
  if (inverse) {
    const inv = Number(inverse);
    if (inv > 0) return String(1 / inv);
  }
  return null;
}

export function toBaseMinor(
  amountMinor: bigint,
  currency: string,
  base: string,
  rates: Map<string, string>,
): bigint {
  const rate = fxRateToBase(currency, base, rates);
  if (!rate) return amountMinor;
  return convert(money(amountMinor, currency), rate, base).amount;
}

export async function computeNetWorth(
  db: Database,
  userId: string,
): Promise<NetWorthBreakdown> {
  const base = getBaseCurrency();
  const rates = await latestFxRates(db);
  const balances = await getAccountBalances(db, userId);

  const accountRows = balances.map((b) => ({
    accountId: b.accountId,
    name: b.name,
    type: b.type,
    currency: b.currency,
    balanceMinor: b.balanceMinor,
    netMinorBase: toBaseMinor(b.netMinor, b.currency, base, rates),
    isLiability: b.isLiability,
  }));

  let assetsMinor = 0n;
  let liabilitiesMinor = 0n;
  let cashAndBankMinor = 0n;
  for (const row of accountRows) {
    if (row.isLiability) {
      liabilitiesMinor += -row.netMinorBase;
    } else {
      assetsMinor += row.netMinorBase;
      if (row.type === "cash" || row.type === "bank" || row.type === "wallet") {
        cashAndBankMinor += row.netMinorBase;
      }
    }
  }

  const holdingRows = await db
    .select({
      id: holdings.id,
      quantity: holdings.quantity,
      instrumentId: holdings.instrumentId,
      symbol: instruments.symbol,
      market: instruments.market,
      name: instruments.name,
      currency: instruments.currency,
      accountName: accounts.name,
    })
    .from(holdings)
    .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
    .leftJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(eq(holdings.userId, userId));

  const instrumentIds = [...new Set(holdingRows.map((h) => h.instrumentId))];
  const priceByInstrument = new Map<string, { price: string; currency: string }>();

  if (instrumentIds.length > 0) {
    const snapshots = await db
      .select()
      .from(priceSnapshots)
      .where(inArray(priceSnapshots.instrumentId, instrumentIds))
      .orderBy(desc(priceSnapshots.asOf));

    for (const snap of snapshots) {
      if (!priceByInstrument.has(snap.instrumentId)) {
        priceByInstrument.set(snap.instrumentId, {
          price: snap.price,
          currency: snap.currency,
        });
      }
    }
  }

  let investmentsMinor = 0n;
  const holdingsOut: NetWorthBreakdown["holdings"] = [];

  for (const h of holdingRows) {
    const snap = priceByInstrument.get(h.instrumentId);
    let marketValueMinor: bigint | null = null;
    let marketValueBaseMinor: bigint | null = null;
    if (snap) {
      const unitPrice = fromDecimal(snap.price, snap.currency);
      const mv = multiply(unitPrice, h.quantity);
      marketValueMinor = mv.amount;
      marketValueBaseMinor = toBaseMinor(mv.amount, mv.currency, base, rates);
      investmentsMinor += marketValueBaseMinor;
      assetsMinor += marketValueBaseMinor;
    }
    holdingsOut.push({
      id: h.id,
      symbol: h.symbol,
      market: h.market,
      name: h.name,
      quantity: h.quantity,
      currency: h.currency,
      price: snap?.price ?? null,
      marketValueMinor,
      marketValueBaseMinor,
      accountName: h.accountName,
    });
  }

  // Optional: fold the personal lending ledger into net worth. Net per person
  // (positive = receivable/asset, negative = payable/liability), in base currency.
  let receivableMinor = 0n;
  let payableMinor = 0n;
  const [settings] = await db
    .select({ include: forecastSettings.includeLendingInNetWorth })
    .from(forecastSettings)
    .where(eq(forecastSettings.userId, userId))
    .limit(1);

  if (settings?.include) {
    const entries = await db
      .select()
      .from(loanLedgerEntries)
      .where(eq(loanLedgerEntries.userId, userId));
    const perPerson = new Map<string, bigint>();
    for (const e of entries) {
      const signed = signedLedgerAmount(e.kind as LoanLedgerKind, e.amountMinor);
      const baseSigned = toBaseMinor(signed, e.currency, base, rates);
      perPerson.set(e.counterparty, (perPerson.get(e.counterparty) ?? 0n) + baseSigned);
    }
    for (const net of perPerson.values()) {
      if (net > 0n) receivableMinor += net;
      else if (net < 0n) payableMinor += -net;
    }
    assetsMinor += receivableMinor;
    liabilitiesMinor += payableMinor;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthRows = await db
    .select({
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.occurredAt, startOfMonth)));

  const activeRecurring = await db
    .select({
      kind: recurringRules.kind,
      amountMinor: recurringRules.amountMinor,
      currency: recurringRules.currency,
    })
    .from(recurringRules)
    .where(and(eq(recurringRules.userId, userId), eq(recurringRules.active, true)));

  const cashflowByCurrency = new Map<
    string,
    { income: bigint; expense: bigint; projectedIncome: bigint; projectedExpense: bigint }
  >();

  for (const row of monthRows) {
    const entry = cashflowByCurrency.get(row.currency) ?? {
      income: 0n,
      expense: 0n,
      projectedIncome: 0n,
      projectedExpense: 0n,
    };
    if (row.type === "income") entry.income += row.amountMinor;
    else if (row.type === "expense") entry.expense += row.amountMinor;
    cashflowByCurrency.set(row.currency, entry);
  }

  for (const rule of activeRecurring) {
    const entry = cashflowByCurrency.get(rule.currency) ?? {
      income: 0n,
      expense: 0n,
      projectedIncome: 0n,
      projectedExpense: 0n,
    };
    if (rule.kind === "income") entry.projectedIncome += rule.amountMinor;
    else entry.projectedExpense += rule.amountMinor;
    cashflowByCurrency.set(rule.currency, entry);
  }

  const monthlyCashflow = Array.from(cashflowByCurrency.entries()).map(([currency, v]) => {
    const netMinor = v.income - v.expense;
    const projectedNet = v.projectedIncome - v.projectedExpense;
    return {
      currency,
      incomeMinor: v.income,
      expenseMinor: v.expense,
      netMinor,
      projectedIncomeMinor: v.projectedIncome,
      projectedExpenseMinor: v.projectedExpense,
      netBaseMinor: toBaseMinor(netMinor + projectedNet, currency, base, rates),
    };
  });

  return {
    baseCurrency: base,
    totalMinor: assetsMinor - liabilitiesMinor,
    assetsMinor,
    liabilitiesMinor,
    cashAndBankMinor,
    investmentsMinor,
    receivableMinor,
    payableMinor,
    accounts: accountRows,
    holdings: holdingsOut,
    monthlyCashflow,
  };
}
