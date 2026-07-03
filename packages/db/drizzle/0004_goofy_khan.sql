CREATE TABLE "forecast_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"default_living_expense_minor" bigint DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'TWD' NOT NULL,
	"horizon_months" integer DEFAULT 12 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"next_run_date" date NOT NULL,
	"total_periods" integer,
	"completed_periods" integer DEFAULT 0 NOT NULL,
	"category_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"month" date NOT NULL,
	"living_expense_minor" bigint NOT NULL,
	"is_actual" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_forecasts_user_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "forecast_settings" ADD CONSTRAINT "forecast_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_forecasts" ADD CONSTRAINT "monthly_forecasts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_installment_schedule_id_installment_schedules_id_fk" FOREIGN KEY ("installment_schedule_id") REFERENCES "public"."installment_schedules"("id") ON DELETE set null ON UPDATE no action;