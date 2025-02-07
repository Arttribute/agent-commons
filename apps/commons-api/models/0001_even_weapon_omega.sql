CREATE TABLE "agent" (
	"agent_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool" (
	"tool_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);
