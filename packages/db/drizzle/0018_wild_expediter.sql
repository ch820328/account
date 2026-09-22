ALTER TABLE "forecast_settings" ADD COLUMN "loan_base_rate" numeric DEFAULT '1.85' NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD COLUMN "amortization_method" text DEFAULT 'flat' NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD COLUMN "rate_margin" numeric DEFAULT '0' NOT NULL;