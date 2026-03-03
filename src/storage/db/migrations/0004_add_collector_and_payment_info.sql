ALTER TABLE "participants" ADD COLUMN "payment_info" text;--> statement-breakpoint
ALTER TABLE "scaffolds" ADD COLUMN "collector_id" text REFERENCES "participants"("id");--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "collector_id" text REFERENCES "participants"("id");