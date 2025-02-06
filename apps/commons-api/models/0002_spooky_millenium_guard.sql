CREATE TABLE "resource" (
	"resource_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"resourceType" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" ALTER COLUMN "agent_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "wallet" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tool" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tool" ADD COLUMN "schema" jsonb NOT NULL;