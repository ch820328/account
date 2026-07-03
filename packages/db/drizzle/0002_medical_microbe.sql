ALTER TABLE "accounts" ADD COLUMN "opening_balance_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "loan_rate_annual" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "loan_term_months" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "loan_start_date" date;