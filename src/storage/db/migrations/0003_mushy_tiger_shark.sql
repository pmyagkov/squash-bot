CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"recipient_id" text NOT NULL,
	"params" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" text,
	"chat_id" text
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "is_paid" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scaffolds" ALTER COLUMN "is_active" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scaffolds" ADD COLUMN "deleted_at" timestamp with time zone;