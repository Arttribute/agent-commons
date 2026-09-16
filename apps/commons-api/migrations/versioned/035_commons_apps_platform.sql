-- 035_commons_apps_platform.sql
-- Custom Commons apps: owner grants, icons, external connections, storage
-- bindings, pinned layouts, and a dedicated schema for app-defined records.

ALTER TABLE ui_plugin ADD COLUMN IF NOT EXISTS icon_url text;
ALTER TABLE ui_plugin ADD COLUMN IF NOT EXISTS grants jsonb;

CREATE TABLE IF NOT EXISTS ui_plugin_connection (
  connection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES ui_plugin(plugin_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  key text NOT NULL,
  encrypted_secret text,
  secret_hint text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_plugin_connection_key
  ON ui_plugin_connection (plugin_id, key);

CREATE TABLE IF NOT EXISTS ui_plugin_storage (
  plugin_id uuid PRIMARY KEY REFERENCES ui_plugin(plugin_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  provider text NOT NULL DEFAULT 'commons',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_secret text,
  secret_hint text,
  last_checked_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT ui_plugin_storage_provider_check
    CHECK (provider IN ('commons', 'supabase', 'mongodb'))
);

CREATE TABLE IF NOT EXISTS ui_plugin_layout (
  owner_user_id text NOT NULL,
  scope text NOT NULL,
  plugin_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (owner_user_id, scope)
);

CREATE SCHEMA IF NOT EXISTS commons_app_data;

CREATE TABLE IF NOT EXISTS commons_app_data.record (
  record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES public.ui_plugin(plugin_id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  collection text NOT NULL,
  data jsonb NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_app_record_collection
  ON commons_app_data.record (plugin_id, collection, created_at);
CREATE INDEX IF NOT EXISTS idx_app_record_data
  ON commons_app_data.record USING gin (data jsonb_path_ops);

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    FOREACH t IN ARRAY ARRAY['ui_plugin_connection', 'ui_plugin_storage', 'ui_plugin_layout']
    LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO commons_api', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', t);
      EXECUTE format('CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;

    GRANT USAGE ON SCHEMA commons_app_data TO commons_api;
    GRANT SELECT, INSERT, UPDATE, DELETE ON commons_app_data.record TO commons_api;
    ALTER TABLE commons_app_data.record ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS commons_api_all ON commons_app_data.record;
    CREATE POLICY commons_api_all ON commons_app_data.record
      FOR ALL TO commons_api USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA commons_app_data FROM anon, authenticated;
  END IF;
END $$;
