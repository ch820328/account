import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
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
  /** Stamped when the user changes their password; null = still on default. */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
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
/** Recurring rules can also model scheduled transfers between accounts. */
export const RECURRING_KINDS = ["income", "expense", "transfer"] as const;
/** Where a transaction came from — manual entry vs an automated schedule. */
export const TRANSACTION_SOURCES = [
  "manual",
  "recurring",
  "payroll",
  "installment",
  "loan",
  "rsu",
] as const;
export const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export const PAYROLL_LINE_KINDS = ["earning", "deduction"] as const;
export const RSU_VEST_STATUSES = ["pending", "vested", "sold"] as const;
export const MARKETS = ["TW", "US"] as const;
export const INSTRUMENT_TYPES = ["stock", "etf", "fund", "crypto"] as const;
/** Personal IOU ledger entry kinds (money lent to / borrowed from a person). */
export const LOAN_LEDGER_KINDS = ["lend", "collect", "borrow", "repay"] as const;

/* ------------------------------------------------------------------ */
/* Finance domain tables.                                              */
/* ------------------------------------------------------------------ */

export const accounts = pgTable(
  "accounts",
  {
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
    parentId: uuid("parent_id"),
    bankCode: text("bank_code"),
    accountNumber: text("account_number"),
    billingDay: integer("billing_day"),
    repaymentDay: integer("repayment_day"),
    excludeFromNetWorth: boolean("exclude_from_net_worth").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }).notNull().defaultNow(),
    cardNumber: text("card_number"),
    cardExpiry: text("card_expiry"),
    cardBrand: text("card_brand"),
  },
  (t) => ({
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<(typeof CATEGORY_KINDS)[number]>(),
  // Self-reference for sub-items, e.g. salary -> base / bonus / overtime.
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurringRules = pgTable("recurring_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().$type<(typeof RECURRING_KINDS)[number]>(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  // For scheduled transfers: the destination account.
  transferAccountId: uuid("transfer_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
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
  autoCommit: boolean("auto_commit").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("recurring_rules_user_idx").on(t.userId),
}));

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

export const payrollLines = pgTable(
  "payroll_lines",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => payrollProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().$type<(typeof PAYROLL_LINE_KINDS)[number]>(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  },
  (t) => ({
    profileIdx: index("payroll_lines_profile_idx").on(t.profileId),
  }),
);

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
  frequency: text("frequency").notNull().default("monthly"),
  estimatedPrice: numeric("estimated_price"),
  /**
   * Percentage of each vest automatically sold to cover withholding tax
   * (sell-to-cover). Only the remaining shares are deposited as holdings.
   */
  sellToCoverPct: numeric("sell_to_cover_pct").notNull().default(sql`0`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rsuVests = pgTable(
  "rsu_vests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => rsuGrants.id, { onDelete: "cascade" }),
    periodIndex: integer("period_index").notNull(),
    vestDate: date("vest_date").notNull(),
    quantity: numeric("quantity").notNull(),
    status: text("status")
      .notNull()
      .$type<(typeof RSU_VEST_STATUSES)[number]>()
      .default("pending"),
    vestPrice: numeric("vest_price"),
    sellToCoverPct: numeric("sell_to_cover_pct"),
    soldDate: date("sold_date"),
    soldPrice: numeric("sold_price"),
    soldFee: numeric("sold_fee"),
  },
  (t) => ({
    grantIdx: index("rsu_vests_grant_idx").on(t.grantId),
  }),
);

export const rsuSells = pgTable(
  "rsu_sells",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vestId: uuid("vest_id")
      .notNull()
      .references(() => rsuVests.id, { onDelete: "cascade" }),
    soldDate: date("sold_date").notNull(),
    quantity: numeric("quantity").notNull(),
    soldPrice: numeric("sold_price").notNull(),
    soldFee: numeric("sold_fee").notNull().default("0"),
    receivedAmount: numeric("received_amount").notNull(),
    receivedAccountId: uuid("received_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vestIdx: index("rsu_sells_vest_idx").on(t.vestId),
  })
);

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
  /** Fallback / default monthly payment when no tier matches. */
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  nextRunDate: date("next_run_date").notNull(),
  /** Payments already generated (drives which tier applies next). */
  completedPeriods: integer("completed_periods").notNull().default(0),
  /** Total number of payments; loan auto-closes after this. Null = open-ended. */
  totalPeriods: integer("total_periods"),
  amortizationMethod: text("amortization_method").notNull().default("flat"),
  rateMargin: numeric("rate_margin").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Stepped payment amounts by period range, e.g. a 新青安 mortgage that pays a
 * lower grace-period amount for periods 1–36 then a higher amount for 37–420.
 */
export const loanPaymentTiers = pgTable(
  "loan_payment_tiers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => loanPaymentSchedules.id, { onDelete: "cascade" }),
    fromPeriod: integer("from_period").notNull(),
    toPeriod: integer("to_period").notNull(),
    isGracePeriod: boolean("is_grace_period").default(false).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    rateMargin: numeric("rate_margin"),
  },
  (t) => ({
    scheduleIdx: index("loan_payment_tiers_schedule_idx").on(t.scheduleId),
  }),
);

/**
 * Global or per-loan rate adjustments applied over time (升降息紀錄).
 */
export const loanRateAdjustments = pgTable(
  "loan_rate_adjustments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => loanPaymentSchedules.id, { onDelete: "cascade" }),
    fromPeriod: integer("from_period").notNull(),
    toPeriod: integer("to_period"),
    adjustmentRate: numeric("adjustment_rate").notNull(),
  },
  (t) => ({
    scheduleIdx: index("loan_rate_adjustments_schedule_idx").on(t.scheduleId),
  }),
);

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
  loanBaseRate: numeric("loan_base_rate").notNull().default("1.85"),
  /**
   * Optional comma-separated category ids that define "living expense" when
   * syncing actuals from the ledger. Empty = all non-scheduled expenses count.
   */
  livingExpenseCategoryIds: text("living_expense_category_ids"),
  /** Include the personal lending ledger (receivable/payable) in net worth. */
  includeLendingInNetWorth: boolean("include_lending_in_net_worth")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monthly spending budget per expense category (base currency minor units). */
export const categoryBudgets = pgTable(
  "category_budgets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("TWD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCategoryUnique: unique("category_budgets_user_category_unique").on(
      t.userId,
      t.categoryId,
    ),
  }),
);

/** Records the outcome of each worker job run (health / last-run surfacing). */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  status: text("status").notNull(),
  message: text("message"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lightweight audit trail for destructive actions (e.g. deleting a record). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("audit_log_user_idx").on(t.userId, t.createdAt),
  }),
);

/** Daily net-worth snapshot for trend charts. Written by the worker. */
export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    asOf: date("as_of").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    assetsMinor: bigint("assets_minor", { mode: "bigint" }).notNull(),
    liabilitiesMinor: bigint("liabilities_minor", { mode: "bigint" }).notNull(),
    cashAndBankMinor: bigint("cash_and_bank_minor", { mode: "bigint" }).notNull(),
    investmentsMinor: bigint("investments_minor", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userAsOfUnique: unique("net_worth_snapshots_user_as_of_unique").on(t.userId, t.asOf),
  }),
);

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
    actualExpenseMinor: bigint("actual_expense_minor", { mode: "bigint" }),
    isActual: boolean("is_actual").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userMonthUnique: unique("monthly_forecasts_user_month_unique").on(t.userId, t.month),
  }),
);

export const monthConfirmations = pgTable(
  "month_confirmations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    confirmed: boolean("confirmed").notNull().default(true),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
  },
  (t) => ({
    userMonthUnique: unique("month_confirmations_user_month_unique").on(t.userId, t.month),
  }),
);

export const transactions = pgTable(
  "transactions",
  {
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
    transferAmountMinor: bigint("transfer_amount_minor", { mode: "bigint" }),
    currency: char("currency", { length: 3 }).notNull(),
    // Snapshot of the FX rate (currency -> base currency) at the time of the tx,
    // so historical net worth can be reproduced exactly.
    fxRateToBase: numeric("fx_rate_to_base"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    isPaid: boolean("is_paid").notNull().default(false),
    /** Optional manual statement month assignment for credit cards (e.g. "2026-08", "2026-09"). */
    statementMonth: varchar("statement_month", { length: 7 }),
    /** Origin of the record: manual bookkeeping or an automated schedule. */
    source: text("source")
      .notNull()
      .$type<(typeof TRANSACTION_SOURCES)[number]>()
      .default("manual"),
    recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    installmentScheduleId: uuid("installment_schedule_id").references(
      () => installmentSchedules.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userOccurredIdx: index("transactions_user_occurred_idx").on(t.userId, t.occurredAt),
    userTypeOccurredIdx: index("transactions_user_type_occurred_idx").on(
      t.userId,
      t.type,
      t.occurredAt,
    ),
    accountOccurredIdx: index("transactions_account_occurred_idx").on(t.accountId, t.occurredAt),
    statementMonthIdx: index("transactions_user_stmt_idx").on(t.userId, t.statementMonth),
  }),
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    fileKey: text("file_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTxIdx: index("attachments_user_tx_idx").on(t.userId, t.transactionId),
  }),
);

export const quickButtons = pgTable(
  "quick_buttons",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").default("⚡"),
    type: text("type").notNull().default("expense").$type<(typeof TRANSACTION_TYPES)[number]>(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    defaultAmountMinor: bigint("default_amount_minor", { mode: "bigint" }),
    matchPattern: text("match_pattern"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSortIdx: index("quick_buttons_user_sort_idx").on(t.userId, t.sortOrder),
  }),
);

export const annualBudgets = pgTable(
  "annual_budgets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    year: integer("year").notNull().default(2026),
    name: text("name").notNull(),
    icon: text("icon").default("⚡"),
    annualAmountMinor: bigint("annual_amount_minor", { mode: "bigint" }).notNull(),
    allocationType: text("allocation_type").notNull().default("rolling"),
    targetMonths: text("target_months"),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    matchPattern: text("match_pattern"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userYearIdx: index("annual_budgets_user_year_idx").on(t.userId, t.year),
  }),
);

export const taxEstimates = pgTable(
  "tax_estimates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    year: integer("year").notNull().default(2026),
    grossIncomeMinor: bigint("gross_income_minor", { mode: "bigint" }).notNull().default(sql`0`),
    bonusIncomeMinor: bigint("bonus_income_minor", { mode: "bigint" }).notNull().default(sql`0`),
    stockGsuIncomeMinor: bigint("stock_gsu_income_minor", { mode: "bigint" }).notNull().default(sql`0`),
    otherIncomeMinor: bigint("other_income_minor", { mode: "bigint" }).notNull().default(sql`0`),
    dependentsCount: integer("dependents_count").notNull().default(4),
    marriedFilingJointly: boolean("married_filing_jointly").notNull().default(true),
    youngChildrenCount: integer("young_children_count").notNull().default(1),
    withheldTaxMinor: bigint("withheld_tax_minor", { mode: "bigint" }).notNull().default(sql`0`),
    calculatedTaxMinor: bigint("calculated_tax_minor", { mode: "bigint" }).notNull().default(sql`0`),
    taxDueMinor: bigint("tax_due_minor", { mode: "bigint" }).notNull().default(sql`0`),
    installmentCount: integer("installment_count").notNull().default(3),
    installmentStartMonth: integer("installment_start_month").notNull().default(5),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userYearIdx: unique("tax_estimates_user_year_unique").on(t.userId, t.year),
  }),
);

export const dcaSchedules = pgTable(
  "dca_schedules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    symbol: text("symbol").notNull(),
    market: text("market").notNull().$type<(typeof MARKETS)[number]>(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("TWD"),
    dayOfMonth: integer("day_of_month").notNull().default(6),
    nextRunDate: date("next_run_date").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("dca_schedules_user_idx").on(t.userId),
  })
);

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

/**
 * Personal lending ledger: money you lent to or borrowed from a person,
 * grouped by counterparty. Each entry is a dated amount; the running balance
 * per person is the signed sum (lent/repay = +, collect/borrow = −).
 */
export const loanLedgerEntries = pgTable(
  "loan_ledger_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    counterparty: text("counterparty").notNull(),
    kind: text("kind").notNull().$type<(typeof LOAN_LEDGER_KINDS)[number]>(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    occurredAt: date("occurred_at").notNull(),
    note: text("note"),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCounterpartyIdx: index("loan_ledger_user_counterparty_idx").on(
      t.userId,
      t.counterparty,
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
export type FinancialAccount = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type NewFinancialAccount = typeof accounts.$inferInsert;
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
export type LoanPaymentTier = typeof loanPaymentTiers.$inferSelect;
export type LoanRateAdjustment = typeof loanRateAdjustments.$inferSelect;
export type InstallmentSchedule = typeof installmentSchedules.$inferSelect;
export type ForecastSettings = typeof forecastSettings.$inferSelect;
export type MonthlyForecast = typeof monthlyForecasts.$inferSelect;
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect;
export type Instrument = typeof instruments.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
export type LoanLedgerEntry = typeof loanLedgerEntries.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type CategoryBudget = typeof categoryBudgets.$inferSelect;
export type MonthConfirmation = typeof monthConfirmations.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;
export type QuickButton = typeof quickButtons.$inferSelect;
export type NewQuickButton = typeof quickButtons.$inferInsert;
export type AnnualBudget = typeof annualBudgets.$inferSelect;
export type NewAnnualBudget = typeof annualBudgets.$inferInsert;
export type TaxEstimate = typeof taxEstimates.$inferSelect;
export type NewTaxEstimate = typeof taxEstimates.$inferInsert;
