import { router } from "../trpc";
import { accountsRouter } from "./accounts";
import { categoriesRouter } from "./categories";
import { forecastRouter } from "./forecast";
import { holdingsRouter } from "./holdings";
import { installmentsRouter } from "./installments";
import { loanPaymentsRouter } from "./loan-payments";
import { netWorthRouter } from "./net-worth";
import { payrollRouter } from "./payroll";
import { rsuRouter } from "./rsu";
import { recurringRouter } from "./recurring";
import { transactionsRouter } from "./transactions";

export const appRouter = router({
  accounts: accountsRouter,
  categories: categoriesRouter,
  forecast: forecastRouter,
  holdings: holdingsRouter,
  installments: installmentsRouter,
  loanPayments: loanPaymentsRouter,
  netWorth: netWorthRouter,
  payroll: payrollRouter,
  recurring: recurringRouter,
  rsu: rsuRouter,
  transactions: transactionsRouter,
});

export type AppRouter = typeof appRouter;
