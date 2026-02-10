CREATE TABLE "event_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"participations" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "event_participants_event_id_participant_id_unique" UNIQUE("event_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"scaffold_id" text,
	"datetime" timestamp with time zone NOT NULL,
	"courts" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"telegram_message_id" text,
	"payment_message_id" text,
	"announcement_deadline" text
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"telegram_username" text,
	"telegram_id" text,
	"display_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"amount" integer NOT NULL,
	"is_paid" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scaffolds" (
	"id" text PRIMARY KEY NOT NULL,
	"day_of_week" varchar(3) NOT NULL,
	"time" varchar(5) NOT NULL,
	"default_courts" integer NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"announcement_deadline" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_scaffold_id_scaffolds_id_fk" FOREIGN KEY ("scaffold_id") REFERENCES "public"."scaffolds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;
