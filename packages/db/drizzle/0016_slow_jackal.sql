ALTER TABLE "accounts" ADD COLUMN "billing_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "repayment_day" integer;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD COLUMN "vest_price" numeric;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD COLUMN "sold_date" date;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD COLUMN "sold_price" numeric;--> statement-breakpoint
ALTER TABLE "rsu_vests" ADD COLUMN "sold_fee" numeric;