import { type Database, dcaSchedules, transactions, holdings, instruments, priceSnapshots, accounts } from "@acc/db";
import { and, eq, lte, desc } from "drizzle-orm";
import { advanceRecurringDate, parseIsoDate } from "./recurring";
import { todayIsoDate } from "./sync";
import { findOrCreateInstrument } from "./rsu";
import { latestFxRates, fxRateToBase } from "./net-worth";
import { money, convert } from "@acc/money";
import { getBaseCurrency } from "./currency";

export interface GenerateDcaResult {
  processed: number;
  created: number;
}

export async function generateDueDcaInvestments(
  db: Database,
  asOf: string = todayIsoDate(),
): Promise<GenerateDcaResult> {
  const due = await db
    .select()
    .from(dcaSchedules)
    .where(
      and(eq(dcaSchedules.active, true), lte(dcaSchedules.nextRunDate, asOf))
    );

  let created = 0;
  if (due.length === 0) return { processed: 0, created: 0 };

  const base = getBaseCurrency();
  const rates = await latestFxRates(db);

  for (const dca of due) {
    const fundingAcct = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, dca.accountId))
      .limit(1)
      .then(r => r[0]);

    if (!fundingAcct) continue;

    const instrumentId = await findOrCreateInstrument(db, dca.symbol, dca.market);
    const inst = await db
      .select()
      .from(instruments)
      .where(eq(instruments.id, instrumentId))
      .limit(1)
      .then(r => r[0]);

    if (!inst) continue;

    const [priceSnap] = await db
      .select()
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.instrumentId, instrumentId),
          lte(priceSnapshots.asOf, dca.nextRunDate)
        )
      )
      .orderBy(desc(priceSnapshots.asOf))
      .limit(1);

    const priceNum = priceSnap ? Number(priceSnap.price) : 100;
    const stockCurrency = inst.currency;

    await db.transaction(async (tx) => {
      let runDate = dca.nextRunDate;
      const monthly = {
        frequency: "monthly" as const,
        interval: 1,
        dayOfMonth: dca.dayOfMonth,
        weekday: null,
      };

      while (runDate <= asOf) {
        let investAmountInStockCurrency = dca.amountMinor;
        if (fundingAcct.currency !== stockCurrency) {
          let baseAmount = dca.amountMinor;
          const fromRate = fxRateToBase(fundingAcct.currency, base, rates);
          if (fromRate) {
            baseAmount = convert(money(dca.amountMinor, fundingAcct.currency), fromRate, base).amount;
          }

          const toRate = fxRateToBase(stockCurrency, base, rates);
          if (toRate && Number(toRate) > 0) {
            investAmountInStockCurrency = convert(money(baseAmount, base), 1 / Number(toRate), stockCurrency).amount;
          }
        }

        const investAmountMajor = Number(investAmountInStockCurrency) / 100;
        const boughtQty = investAmountMajor / priceNum;

        await tx.insert(transactions).values({
          userId: dca.userId,
          accountId: dca.accountId,
          type: "expense",
          amountMinor: dca.amountMinor,
          currency: fundingAcct.currency,
          occurredAt: parseIsoDate(runDate),
          note: `定期定額投資: ${dca.name} (${dca.symbol})`,
          source: "manual",
        });

        const [holding] = await tx
          .select()
          .from(holdings)
          .where(
            and(
              eq(holdings.userId, dca.userId),
              eq(holdings.instrumentId, instrumentId),
              eq(holdings.accountId, dca.brokerAccountId || dca.accountId)
            )
          )
          .limit(1);

        if (holding) {
          const currentQty = Number(holding.quantity);
          const newQty = currentQty + boughtQty;
          const currentAvgCost = Number(holding.avgCostMinor || 0n);
          const newAvgCost = Math.round((currentQty * currentAvgCost + Number(investAmountInStockCurrency)) / newQty);

          await tx
            .update(holdings)
            .set({
              quantity: String(newQty),
              avgCostMinor: BigInt(newAvgCost),
              costCurrency: stockCurrency,
              updatedAt: new Date(),
            })
            .where(eq(holdings.id, holding.id));
        } else {
          await tx.insert(holdings).values({
            userId: dca.userId,
            instrumentId,
            accountId: dca.brokerAccountId || dca.accountId,
            quantity: String(boughtQty),
            avgCostMinor: BigInt(Math.round(Number(investAmountInStockCurrency) / (boughtQty > 0 ? boughtQty : 1))),
            costCurrency: stockCurrency,
          });
        }

        created += 1;
        runDate = advanceRecurringDate(runDate, monthly);
      }

      await tx
        .update(dcaSchedules)
        .set({
          nextRunDate: runDate,
        })
        .where(eq(dcaSchedules.id, dca.id));
    });
  }

  return { processed: due.length, created };
}
