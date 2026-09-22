import { router } from "../trpc";
import { accountsRouter } from "./accounts";
import { budgetsRouter } from "./budgets";
import { categoriesRouter } from "./categories";
import { forecastRouter } from "./forecast";
import { holdingsRouter } from "./holdings";
import { installmentsRouter } from "./installments";
import { loanPaymentsRouter } from "./loan-payments";
import { netWorthRouter } from "./net-worth";
import { payrollRouter } from "./payroll";
import { personalLoansRouter } from "./personal-loans";
import { rsuRouter } from "./rsu";
import { recurringRouter } from "./recurring";
import { securityRouter } from "./security";
import { transactionsRouter } from "./transactions";
import { dcaRouter } from "./dca";
import { attachmentsRouter } from "./attachments";
import { quickButtonsRouter } from "./quick-buttons";
import { annualBudgetsRouter } from "./annual-budgets";

export const appRouter = router({
  accounts: accountsRouter,
  budgets: budgetsRouter,
  categories: categoriesRouter,
  forecast: forecastRouter,
  holdings: holdingsRouter,
  installments: installmentsRouter,
  loanPayments: loanPaymentsRouter,
  netWorth: netWorthRouter,
  payroll: payrollRouter,
  personalLoans: personalLoansRouter,
  recurring: recurringRouter,
  rsu: rsuRouter,
  security: securityRouter,
  transactions: transactionsRouter,
  dca: dcaRouter,
  attachments: attachmentsRouter,
  quickButtons: quickButtonsRouter,
  annualBudgets: annualBudgetsRouter,
});

export type AppRouter = typeof appRouter;
