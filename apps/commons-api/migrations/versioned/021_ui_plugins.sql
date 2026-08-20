CREATE TABLE IF NOT EXISTS "ui_plugin" (
  "plugin_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" text NOT NULL,
  "workspace_id" text,
  "created_by_agent_id" text REFERENCES "agent"("agent_id") ON DELETE SET NULL,
  "code_project_id" uuid NOT NULL REFERENCES "code_project"("project_id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "version" text DEFAULT '1.0.0' NOT NULL,
  "entry_url" text NOT NULL,
  "manifest" jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  "updated_at" timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_ui_plugin_owner_slug"
  ON "ui_plugin" ("owner_user_id", "slug");
CREATE INDEX IF NOT EXISTS "idx_ui_plugin_owner_status"
  ON "ui_plugin" ("owner_user_id", "status", "updated_at");
