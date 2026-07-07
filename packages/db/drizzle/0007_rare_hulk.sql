CREATE TABLE "loan_payment_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"from_period" integer NOT NULL,
	"to_period" integer NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD COLUMN "completed_periods" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_payment_schedules" ADD COLUMN "total_periods" integer;--> statement-breakpoint
ALTER TABLE "loan_payment_tiers" ADD CONSTRAINT "loan_payment_tiers_schedule_id_loan_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."loan_payment_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_payment_tiers_schedule_idx" ON "loan_payment_tiers" USING btree ("schedule_id");