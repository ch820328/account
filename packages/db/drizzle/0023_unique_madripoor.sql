CREATE TABLE "loan_rate_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"from_period" integer NOT NULL,
	"adjustment_rate" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_rate_adjustments" ADD CONSTRAINT "loan_rate_adjustments_schedule_id_loan_payment_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."loan_payment_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_rate_adjustments_schedule_idx" ON "loan_rate_adjustments" USING btree ("schedule_id");