-- Create spaces table
CREATE TABLE "space" (
  "space_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" text NOT NULL,
  "description" text,
  "created_by" text NOT NULL,
  "created_by_type" text NOT NULL,
  "session_id" uuid REFERENCES "session"("session_id") ON DELETE SET NULL,
  "is_public" boolean DEFAULT false NOT NULL,
  "max_members" integer DEFAULT 50,
  "settings" jsonb,
  "created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

-- Create space_member table
CREATE TABLE "space_member" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "space_id" uuid NOT NULL REFERENCES "space"("space_id") ON DELETE CASCADE,
  "member_id" text NOT NULL,
  "member_type" text NOT NULL,
  "role" text DEFAULT 'member',
  "status" text DEFAULT 'active',
  "permissions" jsonb,
  "joined_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  "last_active_at" timestamp with time zone
);

-- Create space_message table
CREATE TABLE "space_message" (
  "message_id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "space_id" uuid NOT NULL REFERENCES "space"("space_id") ON DELETE CASCADE,
  "sender_id" text NOT NULL,
  "sender_type" text NOT NULL,
  "target_type" text DEFAULT 'broadcast',
  "target_ids" jsonb,
  "content" text NOT NULL,
  "message_type" text DEFAULT 'text',
  "metadata" jsonb,
  "is_edited" boolean DEFAULT false,
  "is_deleted" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX "idx_space_member_space_id" ON "space_member" ("space_id");
CREATE INDEX "idx_space_member_member_id" ON "space_member" ("member_id");
CREATE INDEX "idx_space_member_member_type" ON "space_member" ("member_type");
CREATE INDEX "idx_space_member_status" ON "space_member" ("status");

CREATE INDEX "idx_space_message_space_id" ON "space_message" ("space_id");
CREATE INDEX "idx_space_message_sender_id" ON "space_message" ("sender_id");
CREATE INDEX "idx_space_message_created_at" ON "space_message" ("created_at");
CREATE INDEX "idx_space_message_target_type" ON "space_message" ("target_type");
CREATE INDEX "idx_space_message_is_deleted" ON "space_message" ("is_deleted");

-- Create unique constraint to prevent duplicate memberships
CREATE UNIQUE INDEX "idx_space_member_unique" ON "space_member" ("space_id", "member_id", "member_type");

-- Create index for session-based spaces
CREATE INDEX "idx_space_session_id" ON "space" ("session_id");
CREATE INDEX "idx_space_created_by" ON "space" ("created_by");
CREATE INDEX "idx_space_is_public" ON "space" ("is_public");
