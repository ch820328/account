CREATE TABLE "loan_payment_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"liability_account_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"next_run_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"category_id" uuid
);
--> statement-breakpoint
CREATE TABLE "payroll_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT '月薪' NOT NULL,
	"deposit_account_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"day_of_month" integer DEFAULT 25 NOT NULL,
	"next_run_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsu_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"market" text NOT NULL,
	"broker_account_id" uuid,
	"total_quantity" numeric NOT NULL,
	"start_date" date NOT NULL,
	"periods" integer DEFAULT 48 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsu_vests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"period_index" integer NOT NULL,
	"vest_date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD CONSTRAINT "loan_payment_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD CONSTRAINT "loan_payment_schedules_liability_account_id_accounts_id_fk" FOREIGN KEY ("liability_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD CONSTRAINT "loan_payment_schedules_source_account_id_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_profile_id_payroll_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."payroll_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_deposit_account_id_accounts_id_fk" FOREIGN KEY ("deposit_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_grants" ADD CONSTRAINT "rsu_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_grants" ADD CONSTRAINT "rsu_grants_broker_account_id_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD CONSTRAINT "rsu_vests_grant_id_rsu_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."rsu_grants"("id") ON DELETE cascade ON UPDATE no action;