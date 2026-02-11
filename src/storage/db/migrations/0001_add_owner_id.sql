ALTER TABLE "scaffolds" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "owner_id" text;--> statement-breakpoint
UPDATE "events" SET "owner_id" = (SELECT "value" FROM "settings" WHERE "key" = 'admin_id') WHERE "owner_id" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "owner_id" SET NOT NULL;
