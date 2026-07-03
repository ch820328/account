import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Auth tables (better-auth). Names match better-auth's default models. */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Domain enums (kept as text + runtime unions for portability).       */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = [
  "cash",
  "bank",
  "credit",
  "broker",
  "wallet",
  "loan",
  "mortgage",
] as const;
export const LIABILITY_ACCOUNT_TYPES = ["credit", "loan", "mortgage"] as const;
export const CATEGORY_KINDS = ["income", "expense"] as const;
export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export const PAYROLL_LINE_KINDS = ["earning", "deduction"] as const;
export const RSU_VEST_STATUSES = ["pending", "vested"] as const;
export const MARKETS = ["TW", "US"] as const;
export const INSTRUMENT_TYPES = ["stock", "etf", "fund", "crypto"] as const;

/* ------------------------------------------------------------------ */
/* Finance domain tables.                                              */
/* ------------------------------------------------------------------ */

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().$type<(typeof ACCOUNT_TYPES)[number]>(),
  currency: char("currency", { length: 3 }).notNull(),
  /** Starting balance in minor units. Liabilities: positive = amount owed. */
  openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  /** Annual interest rate % (loan / mortgage only), e.g. 2.125 */
  loanRateAnnual: numeric("loan_rate_annual"),
  loanTermMonths: integer("loan_term_months"),
  loanStartDate: date("loan_start_date"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<(typeof CATEGORY_KINDS)[number]>(),
  // Self-reference for sub-items, e.g. salary -> base / bonus / overtime.
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringRules = pgTable("recurring_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<(typeof CATEGORY_KINDS)[number]>(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  frequency: text("frequency").notNull().$type<(typeof FREQUENCIES)[number]>(),
  interval: integer("interval").notNull().default(1),
  dayOfMonth: integer("day_of_month"),
  weekday: integer("weekday"),
  anchorDate: date("anchor_date").notNull(),
  nextRunDate: date("next_run_date").notNull(),
  endDate: date("end_date"),
  note: text("note"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly payslip template: earnings + deductions → net deposit. */
export const payrollProfiles = pgTable("payroll_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("月薪"),
  depositAccountId: uuid("deposit_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  currency: char("currency", { length: 3 }).notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(25),
  nextRunDate: date("next_run_date").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payrollLines = pgTable("payroll_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => payrollProfiles.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<(typeof PAYROLL_LINE_KINDS)[number]>(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
});

/** RSU grant vesting over 48 monthly periods (configurable). */
export const rsuGrants = pgTable("rsu_grants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  market: text("market").notNull().$type<(typeof MARKETS)[number]>(),
  brokerAccountId: uuid("broker_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  totalQuantity: numeric("total_quantity").notNull(),
  startDate: date("start_date").notNull(),
  periods: integer("periods").notNull().default(48),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rsuVests = pgTable("rsu_vests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => rsuGrants.id, { onDelete: "cascade" }),
  periodIndex: integer("period_index").notNull(),
  vestDate: date("vest_date").notNull(),
  quantity: numeric("quantity").notNull(),
  status: text("status").notNull().$type<(typeof RSU_VEST_STATUSES)[number]>().default("pending"),
});

/** Monthly loan/mortgage payment: transfer from bank → liability account. */
export const loanPaymentSchedules = pgTable("loan_payment_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  liabilityAccountId: uuid("liability_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  sourceAccountId: uuid("source_account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  nextRunDate: date("next_run_date").notNull(),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Credit-card / consumer installment: monthly expense on a bank account. */
export const installmentSchedules = pgTable("installment_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  nextRunDate: date("next_run_date").notNull(),
  totalPeriods: integer("total_periods"),
  completedPeriods: integer("completed_periods").notNull().default(0),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-user defaults for cash-flow / net-worth projection. */
export const forecastSettings = pgTable("forecast_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  defaultLivingExpenseMinor: bigint("default_living_expense_minor", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  currency: char("currency", { length: 3 }).notNull().default("TWD"),
  horizonMonths: integer("horizon_months").notNull().default(12),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly living-expense estimate or actual (after bookkeeping). */
export const monthlyForecasts = pgTable(
  "monthly_forecasts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    livingExpenseMinor: bigint("living_expense_minor", { mode: "bigint" }).notNull(),
    isActual: boolean("is_actual").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userMonthUnique: unique("monthly_forecasts_user_month_unique").on(t.userId, t.month),
  }),
);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  // For transfers: the destination account.
  transferAccountId: uuid("transfer_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull().$type<(typeof TRANSACTION_TYPES)[number]>(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  // Snapshot of the FX rate (currency -> base currency) at the time of the tx,
  // so historical net worth can be reproduced exactly.
  fxRateToBase: numeric("fx_rate_to_base"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
  recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
    onDelete: "set null",
  }),
  installmentScheduleId: uuid("installment_schedule_id").references(
    () => installmentSchedules.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const instruments = pgTable(
  "instruments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    symbol: text("symbol").notNull(),
    market: text("market").notNull().$type<(typeof MARKETS)[number]>(),
    name: text("name").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    type: text("type").notNull().$type<(typeof INSTRUMENT_TYPES)[number]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    symbolMarketUnique: unique("instruments_symbol_market_unique").on(t.symbol, t.market),
  }),
);

export const holdings = pgTable("holdings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  instrumentId: uuid("instrument_id")
    .notNull()
    .references(() => instruments.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  quantity: numeric("quantity").notNull(),
  avgCostMinor: bigint("avg_cost_minor", { mode: "bigint" }),
  costCurrency: char("cost_currency", { length: 3 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    price: numeric("price").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    instrumentAsOfUnique: unique("price_snapshots_instrument_as_of_unique").on(
      t.instrumentId,
      t.asOf,
    ),
  }),
);

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    rate: numeric("rate").notNull(),
    asOf: date("as_of").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pairAsOfUnique: unique("fx_rates_base_quote_as_of_unique").on(t.base, t.quote, t.asOf),
  }),
);

export type User = typeof user.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type NewRecurringRule = typeof recurringRules.$inferInsert;
export type PayrollProfile = typeof payrollProfiles.$inferSelect;
export type PayrollLine = typeof payrollLines.$inferSelect;
export type RsuGrant = typeof rsuGrants.$inferSelect;
export type RsuVest = typeof rsuVests.$inferSelect;
export type LoanPaymentSchedule = typeof loanPaymentSchedules.$inferSelect;
export type InstallmentSchedule = typeof installmentSchedules.$inferSelect;
export type ForecastSettings = typeof forecastSettings.$inferSelect;
export type MonthlyForecast = typeof monthlyForecasts.$inferSelect;
export type Instrument = typeof instruments.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
