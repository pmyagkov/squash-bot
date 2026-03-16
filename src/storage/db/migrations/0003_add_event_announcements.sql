CREATE TABLE "event_announcements" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "telegram_message_id" text NOT NULL,
  "telegram_chat_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "event_announcements" ("event_id", "telegram_message_id", "telegram_chat_id")
SELECT "id", "telegram_message_id", "telegram_chat_id"
FROM "events"
WHERE "telegram_message_id" IS NOT NULL AND "telegram_chat_id" IS NOT NULL;
