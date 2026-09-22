CREATE TABLE "dca_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"broker_account_id" uuid,
	"symbol" text NOT NULL,
	"market" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) DEFAULT 'TWD' NOT NULL,
	"day_of_month" integer DEFAULT 6 NOT NULL,
	"next_run_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsu_sells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"vest_id" uuid NOT NULL,
	"sold_date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"sold_price" numeric NOT NULL,
	"sold_fee" numeric DEFAULT '0' NOT NULL,
	"received_amount" numeric NOT NULL,
	"received_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monthly_forecasts" ADD COLUMN "actual_expense_minor" bigint;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD COLUMN "sell_to_cover_pct" numeric;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "dca_schedules" ADD CONSTRAINT "dca_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dca_schedules" ADD CONSTRAINT "dca_schedules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dca_schedules" ADD CONSTRAINT "dca_schedules_broker_account_id_accounts_id_fk" FOREIGN KEY ("broker_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_sells" ADD CONSTRAINT "rsu_sells_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_sells" ADD CONSTRAINT "rsu_sells_vest_id_rsu_vests_id_fk" FOREIGN KEY ("vest_id") REFERENCES "public"."rsu_vests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsu_sells" ADD CONSTRAINT "rsu_sells_received_account_id_accounts_id_fk" FOREIGN KEY ("received_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dca_schedules_user_idx" ON "dca_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rsu_sells_vest_idx" ON "rsu_sells" USING btree ("vest_id");