ALTER TABLE "ui_plugin"
  ADD COLUMN IF NOT EXISTS "deployment_id" uuid;

UPDATE "ui_plugin" AS plugin
SET "deployment_id" = deployment."deployment_id"
FROM "code_project" AS project
JOIN "code_project_deployment" AS deployment
  ON deployment."deployment_id" = project."latest_deployment_id"
  AND deployment."project_id" = project."project_id"
WHERE plugin."code_project_id" = project."project_id"
  AND plugin."deployment_id" IS NULL
  AND deployment."status" = 'ready'
  AND deployment."public_url" IS NOT NULL
  AND (deployment."verification" ->> 'passed') = 'true';

-- Migrations run before the new ECS tasks are installed. Keep the legacy
-- entry_url intact during this expand release so old tasks continue serving
-- active apps. New code derives the immutable route from deployment_id.
-- Unreviewed or unpublished legacy plugins are quarantined until republished,
-- verified, and registered again.
UPDATE "ui_plugin"
SET "status" = 'disabled', "updated_at" = timezone('utc', now())
WHERE "deployment_id" IS NULL
  AND "status" <> 'disabled';

-- A stale task from the rolling deployment must not be able to re-enable an
-- unpinned row after the quarantine update has run.
ALTER TABLE "ui_plugin"
  ADD CONSTRAINT "ui_plugin_active_deployment_check"
  CHECK ("status" <> 'active' OR "deployment_id" IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_code_project_deployment_id_project"
  ON "code_project_deployment" ("deployment_id", "project_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ui_plugin_deployment_project_fk'
  ) THEN
    ALTER TABLE "ui_plugin"
      ADD CONSTRAINT "ui_plugin_deployment_project_fk"
      FOREIGN KEY ("deployment_id", "code_project_id")
      REFERENCES "code_project_deployment"("deployment_id", "project_id")
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_ui_plugin_deployment"
  ON "ui_plugin" ("deployment_id");
