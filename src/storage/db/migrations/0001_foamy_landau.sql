ALTER TABLE "payments" ALTER COLUMN "is_paid" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "scaffolds" ALTER COLUMN "is_active" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "scaffolds" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_participant_id_unique" UNIQUE("event_id","participant_id");