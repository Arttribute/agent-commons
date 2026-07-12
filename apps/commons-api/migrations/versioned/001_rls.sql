-- 001_rls.sql
-- Row-level security + a dedicated, non-superuser application role.
--
-- Defense-in-depth: the NestJS API remains the primary authorization layer, but
-- with RLS enabled and PostgREST roles (anon/authenticated) revoked, a leaked
-- Supabase anon key can no longer read or write application tables directly.
--
-- The app connects as `commons_api` (NOBYPASSRLS). A blanket policy lets that
-- role operate on every table; anon/authenticated get nothing. The Supabase
-- `service_role` (used server-side for pgvector embeddings) keeps BYPASSRLS and
-- is unaffected.
--
-- OPERATOR: after this migration runs, grant the role login + a password
-- (kept out of git) and point POSTGRES_USER/POSTGRES_PASSWORD at it:
--     ALTER ROLE commons_api WITH LOGIN PASSWORD '<generated>';

-- 1. Dedicated application role (created without LOGIN; operator adds it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'commons_api') THEN
    CREATE ROLE commons_api NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO commons_api;
-- CREATE is required so the langgraph PostgresSaver checkpointer can run its
-- setup() (CREATE TABLE/INDEX IF NOT EXISTS) at boot. Still NOBYPASSRLS.
GRANT CREATE ON SCHEMA public TO commons_api;
-- Database-level CREATE/TEMP: the checkpointer's setup() performs a
-- database-scoped operation on connect.
GRANT CREATE, TEMPORARY ON DATABASE CURRENT_CATALOG TO commons_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO commons_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO commons_api;

-- Future tables/sequences created by later migrations inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO commons_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO commons_api;

-- The app owns its schema: it runs boot-time schema migrations (ALTER TABLE)
-- and the langgraph checkpointer's setup() (CREATE), both of which require
-- ownership. Transfer ownership of the public schema objects to commons_api.
-- (The migration runner connects as the admin/postgres role, which must be a
-- member of commons_api to reassign ownership to it.)
GRANT commons_api TO CURRENT_USER;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO commons_api', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO commons_api', r.sequencename);
  END LOOP;
  FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public' LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO commons_api', r.table_name);
  END LOOP;
END $$;

-- 2. Enable RLS on every base table with a blanket allow for commons_api, and
--    revoke direct access from the PostgREST roles. Runs over all current
--    tables; new tables are handled by re-running section 2 in later migrations
--    (or by the helper below) — but the app-level default-deny for anon comes
--    from the REVOKE, which ALTER DEFAULT PRIVILEGES does not grant to them.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS commons_api_all ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY commons_api_all ON public.%I FOR ALL TO commons_api USING (true) WITH CHECK (true)',
      r.tablename
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.tablename);
  END LOOP;
END $$;

-- Ensure the PostgREST roles cannot reach new tables by default either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
