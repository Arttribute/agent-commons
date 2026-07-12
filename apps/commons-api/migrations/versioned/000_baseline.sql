--
-- PostgreSQL database dump
--

\restrict sh6Zs302Eg4CwGekBvYztnWF1gvhS9q63KXocNsphZtXGZTU1qW4LtaFiJ0cDaj

-- Dumped from database version 15.8
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- NOTE: `CREATE SCHEMA public` / its COMMENT were removed from this generated
-- baseline because managed Postgres (Supabase) ships with the public schema
-- already present. Required extensions (uuid-ossp in `extensions`, vector in
-- `public`) are enabled out-of-band before this file is applied.

--
-- Name: match_resources(public.vector, double precision, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_resources(query_embedding public.vector, match_threshold double precision, match_count integer, r_type text) RETURNS TABLE(resource_id text, resource_type text, schema json, tags text[], similarity double precision)
    LANGUAGE sql STABLE
    AS $$
WITH filtered_resource AS (
  SELECT *
  FROM resource
  WHERE resource.resource_type = r_type
)
SELECT
  resource_id,
  resource_type,
  schema,
  tags,
  1 - (embedding <=> query_embedding) AS similarity
FROM filtered_resource
WHERE 1 - (embedding <=> query_embedding) > match_threshold
ORDER BY (embedding <=> query_embedding) ASC
LIMIT match_count;
$$;


--
-- Name: trigger_agent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_agent(agent_id text) RETURNS TABLE(status integer, content jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
WITH 
  http AS ( 
    SELECT * FROM http_post(CONCAT('https://arttribute-commons-api-dev-848878149972.europe-west1.run.app/v1/agents/', agent_id, '/trigger'),
    '{ }',
    'application/json')
    -- SELECT * FROM http_post('https://jsonplaceholder.typicode.com/posts',
    -- '{ "title": "foo", "body": "bar", "userId": 1 }',
    -- 'application/json')
    ),
  headers AS (
    SELECT (unnest(headers)).* FROM http
  )
SELECT
  http.status,
  http.content::jsonb
FROM http;
END;
$$;


--
-- Name: update_agent_memory_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_memory_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: update_agent_wallet_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_agent_wallet_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: update_file_attachment_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_file_attachment_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: update_tool_key_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tool_key_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: update_tool_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tool_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: update_workflow_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_workflow_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: a2a_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.a2a_task (
    task_id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    agent_id text NOT NULL,
    session_id uuid,
    state text DEFAULT 'submitted'::text NOT NULL,
    caller_id text,
    caller_url text,
    input_message jsonb NOT NULL,
    context_id text,
    output_messages jsonb,
    artifacts jsonb,
    push_url text,
    push_token text,
    error jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: activity_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_event (
    event_id text DEFAULT (gen_random_uuid())::text NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_id text NOT NULL,
    workspace_id text,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    source text DEFAULT 'agent_commons'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: agent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent (
    agent_id text DEFAULT extensions.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    instructions text,
    persona text,
    owner text,
    name text,
    external_tools jsonb,
    temperature double precision,
    max_tokens integer,
    top_p double precision,
    presence_penalty double precision,
    frequency_penalty double precision,
    common_tools json,
    avatar text,
    stop_sequence jsonb,
    is_liaison boolean,
    liaison_key text,
    external_url text,
    external_endpoint text,
    network text,
    liaison_key_display text,
    liaison_key_hash text,
    autonomy_enabled boolean DEFAULT false,
    cron_job_name text,
    autonomous_interval_sec integer DEFAULT 0,
    knowledgebase jsonb,
    tts_provider text DEFAULT 'openai'::text,
    tts_voice text,
    model_provider text DEFAULT 'openai'::text NOT NULL,
    model_id text DEFAULT 'gpt-4o'::text NOT NULL,
    model_api_key text,
    model_base_url text,
    a2a_enabled boolean DEFAULT false NOT NULL,
    a2a_skills jsonb,
    a2a_endpoint text,
    owner_user_id text,
    workspace_id text,
    greeting text,
    conversation_starters jsonb,
    runtime_type text DEFAULT 'native'::text NOT NULL,
    runtime_version text,
    runtime_status text DEFAULT 'ready'::text NOT NULL,
    runtime_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    runtime_capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    runtime_updated_at timestamp with time zone,
    CONSTRAINT agent_runtime_status_check CHECK ((runtime_status = ANY (ARRAY['disabled'::text, 'provisioning'::text, 'starting'::text, 'ready'::text, 'degraded'::text, 'stopped'::text, 'failed'::text]))),
    CONSTRAINT agent_runtime_type_check CHECK ((runtime_type = ANY (ARRAY['native'::text, 'openclaw'::text, 'hermes'::text, 'custom'::text])))
);


--
-- Name: COLUMN agent.owner; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.owner IS 'Owner of the agent';


--
-- Name: COLUMN agent.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.name IS 'Name of the agent';


--
-- Name: COLUMN agent.external_tools; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.external_tools IS 'External tools the agent has access to';


--
-- Name: COLUMN agent.temperature; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.temperature IS 'Agent setting';


--
-- Name: COLUMN agent.max_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.max_tokens IS 'Agent setting';


--
-- Name: COLUMN agent.top_p; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.top_p IS 'Agent Setting';


--
-- Name: COLUMN agent.presence_penalty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.presence_penalty IS 'Agent setting';


--
-- Name: COLUMN agent.frequency_penalty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.frequency_penalty IS 'Agent setting';


--
-- Name: COLUMN agent.common_tools; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.common_tools IS 'Common Tools Loaded to the agent';


--
-- Name: COLUMN agent.avatar; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.avatar IS 'Agent Avatar';


--
-- Name: COLUMN agent.stop_sequence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.stop_sequence IS 'Agent setting';


--
-- Name: COLUMN agent.is_liaison; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.is_liaison IS 'Set to true if agent is a liason to an external aget';


--
-- Name: COLUMN agent.liaison_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.liaison_key IS 'Hashed liaison key';


--
-- Name: COLUMN agent.external_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.external_url IS 'URL pointing to where the external agent can be found and used';


--
-- Name: COLUMN agent.external_endpoint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.external_endpoint IS 'Endpoint that can be used to interact with the external agent';


--
-- Name: COLUMN agent.network; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.network IS 'Network in which agent is deployed to';


--
-- Name: COLUMN agent.liaison_key_display; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.liaison_key_display IS 'Portion of liaison key that user can view';


--
-- Name: COLUMN agent.liaison_key_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.liaison_key_hash IS 'Hashed liaison key';


--
-- Name: COLUMN agent.autonomy_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.autonomy_enabled IS 'Set to true when agent autonomous mode is enabled';


--
-- Name: COLUMN agent.cron_job_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.cron_job_name IS 'Name of cron job when in autonomous mode';


--
-- Name: COLUMN agent.autonomous_interval_sec; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.autonomous_interval_sec IS 'Time interval in which agent cron in autonomous mode is run';


--
-- Name: COLUMN agent.knowledgebase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.knowledgebase IS 'Agent Knowledgebase';


--
-- Name: COLUMN agent.tts_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.tts_provider IS 'Agent voice Provider';


--
-- Name: COLUMN agent.tts_voice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.tts_voice IS 'Agent Voice ID (OpenAI voice name or ElevenLabs voiceId)';


--
-- Name: COLUMN agent.runtime_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent.runtime_type IS 'Execution adapter: native, openclaw, hermes, or a future custom runtime.';


--
-- Name: agent_computer_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_computer_config (
    config_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    default_mode text DEFAULT 'persistent'::text NOT NULL,
    auto_start boolean DEFAULT false NOT NULL,
    allow_agent_start boolean DEFAULT true NOT NULL,
    allow_user_select boolean DEFAULT true NOT NULL,
    allow_browser boolean DEFAULT true NOT NULL,
    allow_terminal boolean DEFAULT true NOT NULL,
    allow_filesystem boolean DEFAULT true NOT NULL,
    network_access text DEFAULT 'standard'::text NOT NULL,
    max_persistent_computers integer DEFAULT 1 NOT NULL,
    max_ephemeral_computers integer DEFAULT 0 NOT NULL,
    max_concurrent_computers integer DEFAULT 1 NOT NULL,
    idle_ttl_minutes integer DEFAULT 60 NOT NULL,
    session_ttl_minutes integer DEFAULT 180 NOT NULL,
    image text,
    cpu_limit text DEFAULT '2'::text,
    memory_limit text DEFAULT '4Gi'::text,
    storage_limit text DEFAULT '20Gi'::text,
    region text,
    provider text DEFAULT 'commonos'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resource_profile text DEFAULT 'standard'::text NOT NULL,
    resource_mode text DEFAULT 'elastic'::text NOT NULL,
    cpu_request text DEFAULT '500m'::text,
    memory_request text DEFAULT '1Gi'::text,
    gpu_type text,
    gpu_count integer DEFAULT 0 NOT NULL,
    billing_mode text DEFAULT 'tier'::text NOT NULL,
    CONSTRAINT agent_computer_config_gpu_count_check CHECK (((gpu_count >= 0) AND (gpu_count <= 8))),
    CONSTRAINT agent_computer_config_resource_mode_check CHECK ((resource_mode = ANY (ARRAY['fixed'::text, 'elastic'::text]))),
    CONSTRAINT agent_computer_config_resource_profile_check CHECK ((resource_profile = ANY (ARRAY['starter'::text, 'standard'::text, 'performance'::text, 'gpu'::text])))
);


--
-- Name: agent_computer_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_computer_event (
    event_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    computer_id uuid NOT NULL,
    agent_id text NOT NULL,
    session_id uuid,
    event_type text NOT NULL,
    actor_type text DEFAULT 'agent'::text NOT NULL,
    actor_id text,
    summary text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: agent_computer_instance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_computer_instance (
    computer_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id text NOT NULL,
    session_id uuid,
    owner_user_id text,
    workspace_id text,
    name text NOT NULL,
    lifecycle text DEFAULT 'persistent'::text NOT NULL,
    status text DEFAULT 'provisioning'::text NOT NULL,
    provider text DEFAULT 'commonos'::text NOT NULL,
    cloud_provider text,
    region text,
    namespace_id text,
    pod_name text,
    common_os_fleet_id text,
    common_os_agent_id text,
    image text,
    cpu_limit text,
    memory_limit text,
    storage_limit text,
    workspace_root text DEFAULT '/mnt/shared'::text,
    workspace_snapshot text,
    browser jsonb,
    terminal jsonb,
    metadata jsonb,
    last_activity_at timestamp with time zone,
    expires_at timestamp with time zone,
    started_at timestamp with time zone,
    stopped_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    canonical boolean DEFAULT false NOT NULL,
    desired_state text DEFAULT 'running'::text NOT NULL,
    resource_profile text DEFAULT 'standard'::text NOT NULL,
    resource_mode text DEFAULT 'elastic'::text NOT NULL,
    cpu_request text,
    memory_request text,
    gpu_type text,
    gpu_count integer DEFAULT 0 NOT NULL,
    runtime_generation integer DEFAULT 0 NOT NULL,
    persistent_volume_id text,
    compute_tenant_id text,
    compute_cell_id text
);


--
-- Name: COLUMN agent_computer_instance.canonical; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_computer_instance.canonical IS 'The one durable logical computer currently assigned to an agent; older rows are retained as history.';


--
-- Name: COLUMN agent_computer_instance.desired_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.agent_computer_instance.desired_state IS 'Control-plane intent. stopped means the pod may be removed while the workspace volume remains.';


--
-- Name: agent_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_log (
    log_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id text,
    session_id text,
    action text,
    message text,
    status text,
    response_time text,
    tools json
);


--
-- Name: TABLE agent_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_log IS 'Agent Logs';


--
-- Name: agent_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_memory (
    memory_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id text NOT NULL,
    session_id uuid,
    memory_type text DEFAULT 'semantic'::text NOT NULL,
    content text NOT NULL,
    summary text NOT NULL,
    importance_score real DEFAULT 0.5 NOT NULL,
    access_count integer DEFAULT 0 NOT NULL,
    last_accessed_at timestamp with time zone,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    source_type text DEFAULT 'auto'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: agent_preferred_connection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_preferred_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id text,
    preferred_agent_id text,
    usage_comments text
);


--
-- Name: TABLE agent_preferred_connection; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_preferred_connection IS 'Agent to agent Connections';


--
-- Name: agent_tool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_tool (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id text NOT NULL,
    tool_id uuid NOT NULL,
    usage_comments text,
    secure_key_ref text,
    is_enabled boolean DEFAULT true,
    config jsonb,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: TABLE agent_tool; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.agent_tool IS 'Agent tools connections';


--
-- Name: agent_wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_wallet (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id text NOT NULL,
    wallet_type text DEFAULT 'eoa'::text NOT NULL,
    address text NOT NULL,
    encrypted_private_key text,
    smart_account_address text,
    session_permissions jsonb,
    chain_id text DEFAULT '84532'::text NOT NULL,
    label text DEFAULT 'Primary'::text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    key_hash text NOT NULL,
    principal_id text NOT NULL,
    principal_type text NOT NULL,
    label text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_used_at timestamp with time zone,
    key_prefix text,
    workspace_id text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    expires_at timestamp with time zone,
    credential_type text DEFAULT 'personal_access_token'::text NOT NULL,
    CONSTRAINT api_keys_principal_type_check CHECK ((principal_type = ANY (ARRAY['user'::text, 'agent'::text])))
);


--
-- Name: app_schema_migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_schema_migration (
    migration_id text NOT NULL,
    applied_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: checkpoint_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_blobs (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    channel text NOT NULL,
    version text NOT NULL,
    type text NOT NULL,
    blob bytea
);


--
-- Name: checkpoint_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_migrations (
    v integer NOT NULL
);


--
-- Name: checkpoint_writes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoint_writes (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    task_id text NOT NULL,
    idx integer NOT NULL,
    channel text NOT NULL,
    type text,
    blob bytea NOT NULL
);


--
-- Name: checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkpoints (
    thread_id text NOT NULL,
    checkpoint_ns text DEFAULT ''::text NOT NULL,
    checkpoint_id text NOT NULL,
    parent_checkpoint_id text,
    type text,
    checkpoint jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: credit_ledger_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger_entry (
    entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    principal_id text NOT NULL,
    principal_type text DEFAULT 'user'::text NOT NULL,
    workspace_id text,
    amount integer NOT NULL,
    currency text DEFAULT 'credits'::text NOT NULL,
    direction text NOT NULL,
    event_type text NOT NULL,
    source_platform text NOT NULL,
    idempotency_key text NOT NULL,
    description text,
    related_course_id text,
    related_challenge_id text,
    agent_id text,
    session_id uuid,
    task_id uuid,
    workflow_id uuid,
    usage_event_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by text,
    created_by_type text DEFAULT 'service'::text,
    expires_at timestamp with time zone,
    voided_at timestamp with time zone,
    void_reason text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: discord_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discord_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    encrypted_token text NOT NULL,
    channel_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: file_artifact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_artifact (
    artifact_id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid NOT NULL,
    kind text NOT NULL,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    page_number integer,
    width integer,
    height integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: file_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_attachment (
    file_id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id text,
    session_id uuid,
    owner_id text,
    owner_type text DEFAULT 'user'::text NOT NULL,
    workspace_id text,
    storage_bucket text NOT NULL,
    storage_path text NOT NULL,
    original_name text NOT NULL,
    mime_type text NOT NULL,
    kind text NOT NULL,
    size_bytes integer NOT NULL,
    sha256 text NOT NULL,
    status text DEFAULT 'ready'::text NOT NULL,
    text_storage_path text,
    text_preview text,
    extracted_text_chars integer DEFAULT 0 NOT NULL,
    extraction_error text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT file_attachment_owner_type_check CHECK ((owner_type = ANY (ARRAY['user'::text, 'agent'::text, 'service'::text]))),
    CONSTRAINT file_attachment_status_check CHECK ((status = ANY (ARRAY['ready'::text, 'partial'::text, 'failed'::text])))
);


--
-- Name: goal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal (
    goal_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id text,
    session_id text,
    title text,
    status text DEFAULT 'pending'::text,
    priority smallint DEFAULT '0'::smallint,
    deadline timestamp with time zone,
    progress double precision,
    is_auto_generated boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now(),
    completed_at timestamp with time zone,
    description text,
    metadata jsonb
);


--
-- Name: TABLE goal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.goal IS 'Goals set by agents';


--
-- Name: COLUMN goal.deadline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.goal.deadline IS 'Deadline for goal to be completed';


--
-- Name: COLUMN goal.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.goal.completed_at IS 'Time of goal completion';


--
-- Name: mcp_server; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_server (
    server_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    owner_id text NOT NULL,
    owner_type text NOT NULL,
    connection_type text NOT NULL,
    connection_config jsonb NOT NULL,
    status text DEFAULT 'disconnected'::text,
    last_error text,
    last_connected_at timestamp with time zone,
    capabilities jsonb,
    tools_discovered jsonb,
    last_synced_at timestamp with time zone,
    is_public boolean DEFAULT false,
    tags jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: mcp_tool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mcp_tool (
    mcp_tool_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    server_id uuid NOT NULL,
    tool_name text NOT NULL,
    display_name text,
    description text,
    input_schema jsonb NOT NULL,
    is_active boolean DEFAULT true,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: oauth_connection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_connection (
    connection_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_id text NOT NULL,
    owner_type text NOT NULL,
    provider_id uuid NOT NULL,
    encrypted_access_token text NOT NULL,
    access_token_iv text NOT NULL,
    access_token_tag text NOT NULL,
    access_token_expires_at timestamp with time zone,
    encrypted_refresh_token text NOT NULL,
    refresh_token_iv text NOT NULL,
    refresh_token_tag text NOT NULL,
    encrypted_id_token text,
    id_token_iv text,
    id_token_tag text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    provider_user_id text,
    provider_user_email text,
    provider_user_name text,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'active'::text,
    last_refreshed_at timestamp with time zone,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0,
    last_error text,
    last_error_at timestamp with time zone,
    display_name text,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: oauth_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_provider (
    provider_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    provider_key text NOT NULL,
    display_name text NOT NULL,
    description text,
    logo_url text,
    auth_url text NOT NULL,
    token_url text NOT NULL,
    revoke_url text,
    user_info_url text,
    client_id text NOT NULL,
    encrypted_client_secret text NOT NULL,
    secret_iv text NOT NULL,
    secret_tag text NOT NULL,
    scopes jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb,
    token_params jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    is_platform boolean DEFAULT true,
    owner_id text,
    owner_type text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: oauth_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_state (
    state_id text NOT NULL,
    owner_id text NOT NULL,
    provider_id uuid NOT NULL,
    code_verifier text,
    redirect_uri text NOT NULL,
    requested_scopes text[] DEFAULT '{}'::text[] NOT NULL,
    user_agent text,
    ip_address text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT oauth_state_check CHECK ((expires_at > created_at))
);


--
-- Name: resource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource (
    resource_id text NOT NULL,
    resource_type text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    embedding public.vector NOT NULL,
    tags text[],
    schema json,
    resource_file text,
    embedding_type text
);


--
-- Name: COLUMN resource.resource_file; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resource.resource_file IS 'Link to resource file';


--
-- Name: COLUMN resource.embedding_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.resource.embedding_type IS 'Type of content embedded';


--
-- Name: scheduled_task_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_task_run (
    run_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    session_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    triggered_by text DEFAULT 'cron'::text NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    session_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    model jsonb,
    query jsonb,
    history jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    agent_id text,
    status text,
    metrics jsonb,
    ended_at timestamp with time zone,
    updated_at timestamp with time zone,
    initiator text,
    title text,
    parent_session text,
    spaces jsonb,
    initiator_type text DEFAULT 'web'::text,
    runtime_type text DEFAULT 'native'::text NOT NULL,
    runtime_session_id text
);


--
-- Name: COLUMN session.agent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.agent_id IS 'Agent to which the session belongs to';


--
-- Name: COLUMN session.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.status IS 'Seession status: active | completed | failed | terminated';


--
-- Name: COLUMN session.metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.metrics IS 'Session Metrics';


--
-- Name: COLUMN session.ended_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.ended_at IS 'Session end time';


--
-- Name: COLUMN session.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.updated_at IS 'Time last updated';


--
-- Name: COLUMN session.initiator; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.initiator IS 'Entity initiating the conversation';


--
-- Name: COLUMN session.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.title IS 'Session title';


--
-- Name: COLUMN session.parent_session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.parent_session IS 'Parent session if any';


--
-- Name: COLUMN session.spaces; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.spaces IS 'Spaces interacted with  in a session';


--
-- Name: COLUMN session.runtime_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session.runtime_session_id IS 'Optional runtime-local handle correlated to the canonical Agent Commons session ID.';


--
-- Name: shared_memory_entry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_memory_entry (
    entry_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    scope_id uuid NOT NULL,
    key text NOT NULL,
    version integer NOT NULL,
    content text NOT NULL,
    summary text NOT NULL,
    authored_by_agent_id text NOT NULL,
    authored_by_session_id uuid,
    supersedes_entry_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT shared_memory_entry_version_check CHECK ((version > 0))
);


--
-- Name: shared_memory_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_memory_member (
    member_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    scope_id uuid NOT NULL,
    agent_id text NOT NULL,
    access text DEFAULT 'write'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT shared_memory_member_access_check CHECK ((access = ANY (ARRAY['read'::text, 'write'::text, 'admin'::text])))
);


--
-- Name: shared_memory_scope; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_memory_scope (
    scope_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_user_id text NOT NULL,
    workspace_id text,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: skill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill (
    skill_id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    instructions text NOT NULL,
    tools jsonb DEFAULT '[]'::jsonb NOT NULL,
    triggers jsonb DEFAULT '[]'::jsonb NOT NULL,
    owner_id text,
    owner_type text DEFAULT 'platform'::text NOT NULL,
    is_public boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    icon text,
    usage_count integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'platform'::text NOT NULL,
    source_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: space; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space (
    space_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    created_by text NOT NULL,
    created_by_type text NOT NULL,
    session_id uuid,
    is_public boolean DEFAULT false NOT NULL,
    max_members integer DEFAULT 50,
    settings jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    image text
);


--
-- Name: COLUMN space.image; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.space.image IS 'Space image';


--
-- Name: space_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_member (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    space_id uuid NOT NULL,
    member_id text NOT NULL,
    member_type text NOT NULL,
    role text DEFAULT 'member'::text,
    status text DEFAULT 'active'::text,
    permissions jsonb,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_active_at timestamp with time zone,
    is_subscribed boolean DEFAULT true
);


--
-- Name: COLUMN space_member.is_subscribed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.space_member.is_subscribed IS 'True when agent gets notified whenever a message is sent to the space';


--
-- Name: space_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.space_message (
    message_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    space_id uuid NOT NULL,
    sender_id text NOT NULL,
    sender_type text NOT NULL,
    target_type text DEFAULT 'broadcast'::text,
    target_ids jsonb,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    metadata jsonb,
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task (
    task_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id text,
    goal_id uuid,
    title text,
    description text,
    status text,
    priority smallint DEFAULT '0'::smallint,
    scheduled_start timestamp without time zone,
    scheduled_end timestamp without time zone,
    actual_start timestamp without time zone,
    actual_end timestamp without time zone,
    estimated_duration integer,
    progress double precision,
    is_recurring boolean DEFAULT false,
    context jsonb,
    tools jsonb,
    metadata jsonb,
    summary text,
    updated_at timestamp without time zone DEFAULT now(),
    result_content text,
    session_id text,
    execution_mode text DEFAULT 'single'::text,
    workflow_id uuid,
    workflow_inputs jsonb,
    workflow_outputs jsonb,
    cron_expression text,
    depends_on text[],
    created_by text,
    created_by_type text,
    scheduled_for timestamp with time zone,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone,
    error_message text,
    completed_at timestamp with time zone,
    tool_constraint_type text DEFAULT 'none'::text NOT NULL,
    tool_instructions text,
    recurring_session_mode text DEFAULT 'same'::text NOT NULL,
    timeout_ms integer,
    CONSTRAINT task_created_by_type_check CHECK ((created_by_type = ANY (ARRAY['user'::text, 'agent'::text]))),
    CONSTRAINT task_execution_mode_check CHECK ((execution_mode = ANY (ARRAY['single'::text, 'workflow'::text, 'sequential'::text])))
);


--
-- Name: TABLE task; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task IS 'Agent Tasks';


--
-- Name: COLUMN task.result_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task.result_content IS 'Result of the task';


--
-- Name: COLUMN task.session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.task.session_id IS 'Session to which the task belongs to';


--
-- Name: task_dependency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependency (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dependent_task_id uuid,
    dependency_task_id uuid,
    dependency_type text DEFAULT 'finish_to_start'::text
);


--
-- Name: TABLE task_dependency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.task_dependency IS 'Shows how agent tasks are related to each other';


--
-- Name: tool; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool (
    tool_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    schema jsonb NOT NULL,
    owner_id text,
    is_public boolean,
    description text,
    updated_at timestamp with time zone,
    tags jsonb,
    ratings jsonb,
    version text,
    input_schema jsonb,
    output_schema jsonb,
    visibility text DEFAULT 'platform'::text,
    display_name text,
    api_spec jsonb,
    category text,
    icon text,
    is_deprecated boolean DEFAULT false,
    execution_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    rate_limit_per_minute integer,
    rate_limit_per_hour integer,
    owner_type text,
    owner text,
    CONSTRAINT tool_visibility_check CHECK ((visibility = ANY (ARRAY['platform'::text, 'public'::text, 'private'::text])))
);


--
-- Name: COLUMN tool.owner_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.owner_id IS 'Tool Owner';


--
-- Name: COLUMN tool.is_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.is_public IS 'Set to true if tool is accessible to everyone in the platform';


--
-- Name: COLUMN tool.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.description IS 'tool description';


--
-- Name: COLUMN tool.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.updated_at IS 'Time when tool was updated';


--
-- Name: COLUMN tool.tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.tags IS 'tool tags for better discoverability';


--
-- Name: COLUMN tool.ratings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.ratings IS 'tool ratings';


--
-- Name: COLUMN tool.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tool.version IS 'Tool Version';


--
-- Name: tool_execution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_execution_log (
    log_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tool_id uuid NOT NULL,
    agent_id text,
    session_id uuid,
    user_id text,
    status text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    duration integer,
    input_args jsonb,
    output_data jsonb,
    error_message text,
    error_stack text,
    key_id uuid,
    rate_limit_hit boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tool_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_key (
    key_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tool_id uuid NOT NULL,
    owner_id text NOT NULL,
    owner_type text NOT NULL,
    encrypted_value text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    key_name text,
    display_name text,
    encryption_iv text NOT NULL,
    encryption_tag text NOT NULL,
    key_type text,
    last_used_at timestamp with time zone,
    usage_count integer DEFAULT 0,
    masked_value text,
    expires_at timestamp with time zone,
    description text,
    CONSTRAINT tool_key_owner_type_check CHECK ((owner_type = ANY (ARRAY['platform'::text, 'user'::text, 'agent'::text])))
);


--
-- Name: tool_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_permission (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tool_id uuid NOT NULL,
    subject_id text NOT NULL,
    subject_type text NOT NULL,
    permission text NOT NULL,
    granted_by text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: usage_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_event (
    event_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    agent_id text NOT NULL,
    session_id uuid,
    task_id uuid,
    workflow_execution_id uuid,
    provider text NOT NULL,
    model_id text NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cached_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    cost_usd real DEFAULT 0 NOT NULL,
    is_byok boolean DEFAULT false NOT NULL,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    trace_id uuid,
    model_provider text,
    runtime_type text DEFAULT 'native'::text NOT NULL,
    usage_source text DEFAULT 'agent_commons'::text NOT NULL
);


--
-- Name: workflow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow (
    workflow_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    owner_id text NOT NULL,
    owner_type text NOT NULL,
    definition jsonb NOT NULL,
    input_schema jsonb,
    output_schema jsonb,
    is_public boolean DEFAULT false NOT NULL,
    category text,
    tags jsonb,
    usage_count integer DEFAULT 0 NOT NULL,
    fork_count integer DEFAULT 0 NOT NULL,
    forked_from_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    actual_output_schema jsonb,
    schema_locked boolean DEFAULT false,
    is_template boolean DEFAULT false,
    trigger_type text DEFAULT 'manual'::text,
    trigger_config jsonb,
    execution_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    failure_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    version text DEFAULT '1.0.0'::text,
    timeout_ms integer DEFAULT 300000,
    is_active boolean DEFAULT true,
    CONSTRAINT workflow_owner_type_check CHECK ((owner_type = ANY (ARRAY['user'::text, 'agent'::text])))
);


--
-- Name: workflow_execution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_execution (
    execution_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    workflow_id uuid NOT NULL,
    agent_id text,
    session_id uuid,
    task_id uuid,
    input_data jsonb,
    output_data jsonb,
    status text NOT NULL,
    current_node text,
    error text,
    started_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at timestamp with time zone,
    user_id text,
    node_results jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    approval_token text,
    approval_data jsonb,
    paused_node_outputs jsonb,
    paused_at_node text,
    CONSTRAINT workflow_execution_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: workflow_execution_node; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_execution_node (
    node_execution_id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    execution_id uuid NOT NULL,
    node_id text NOT NULL,
    node_type text NOT NULL,
    status text NOT NULL,
    input_data jsonb,
    output_data jsonb,
    error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT workflow_execution_node_node_type_check CHECK ((node_type = ANY (ARRAY['tool'::text, 'agent_processor'::text, 'input'::text, 'output'::text]))),
    CONSTRAINT workflow_execution_node_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: a2a_task a2a_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_task
    ADD CONSTRAINT a2a_task_pkey PRIMARY KEY (task_id);


--
-- Name: activity_event activity_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_event
    ADD CONSTRAINT activity_event_pkey PRIMARY KEY (event_id);


--
-- Name: agent_computer_config agent_computer_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_config
    ADD CONSTRAINT agent_computer_config_pkey PRIMARY KEY (config_id);


--
-- Name: agent_computer_event agent_computer_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_event
    ADD CONSTRAINT agent_computer_event_pkey PRIMARY KEY (event_id);


--
-- Name: agent_computer_instance agent_computer_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_instance
    ADD CONSTRAINT agent_computer_instance_pkey PRIMARY KEY (computer_id);


--
-- Name: agent_log agent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_log
    ADD CONSTRAINT agent_log_pkey PRIMARY KEY (log_id);


--
-- Name: agent_memory agent_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_pkey PRIMARY KEY (memory_id);


--
-- Name: agent agent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent
    ADD CONSTRAINT agent_pkey PRIMARY KEY (agent_id);


--
-- Name: agent_preferred_connection agent_preferred_connection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_preferred_connection
    ADD CONSTRAINT agent_preferred_connection_pkey PRIMARY KEY (id);


--
-- Name: agent_tool agent_tool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool
    ADD CONSTRAINT agent_tool_pkey PRIMARY KEY (id);


--
-- Name: agent_wallet agent_wallet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallet
    ADD CONSTRAINT agent_wallet_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: app_schema_migration app_schema_migration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_schema_migration
    ADD CONSTRAINT app_schema_migration_pkey PRIMARY KEY (migration_id);


--
-- Name: checkpoint_blobs checkpoint_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_blobs
    ADD CONSTRAINT checkpoint_blobs_pkey PRIMARY KEY (thread_id, checkpoint_ns, channel, version);


--
-- Name: checkpoint_migrations checkpoint_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_migrations
    ADD CONSTRAINT checkpoint_migrations_pkey PRIMARY KEY (v);


--
-- Name: checkpoint_writes checkpoint_writes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoint_writes
    ADD CONSTRAINT checkpoint_writes_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx);


--
-- Name: checkpoints checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkpoints
    ADD CONSTRAINT checkpoints_pkey PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id);


--
-- Name: credit_ledger_entry credit_ledger_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger_entry
    ADD CONSTRAINT credit_ledger_entry_pkey PRIMARY KEY (entry_id);


--
-- Name: discord_accounts discord_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discord_accounts
    ADD CONSTRAINT discord_accounts_pkey PRIMARY KEY (id);


--
-- Name: file_artifact file_artifact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_artifact
    ADD CONSTRAINT file_artifact_pkey PRIMARY KEY (artifact_id);


--
-- Name: file_attachment file_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_attachment
    ADD CONSTRAINT file_attachment_pkey PRIMARY KEY (file_id);


--
-- Name: goal goal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal
    ADD CONSTRAINT goal_pkey PRIMARY KEY (goal_id);


--
-- Name: mcp_server mcp_server_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_server
    ADD CONSTRAINT mcp_server_pkey PRIMARY KEY (server_id);


--
-- Name: mcp_tool mcp_tool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool
    ADD CONSTRAINT mcp_tool_pkey PRIMARY KEY (mcp_tool_id);


--
-- Name: oauth_connection oauth_connection_owner_id_owner_type_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_connection
    ADD CONSTRAINT oauth_connection_owner_id_owner_type_provider_id_key UNIQUE (owner_id, owner_type, provider_id);


--
-- Name: oauth_connection oauth_connection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_connection
    ADD CONSTRAINT oauth_connection_pkey PRIMARY KEY (connection_id);


--
-- Name: oauth_provider oauth_provider_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_provider
    ADD CONSTRAINT oauth_provider_pkey PRIMARY KEY (provider_id);


--
-- Name: oauth_provider oauth_provider_provider_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_provider
    ADD CONSTRAINT oauth_provider_provider_key_key UNIQUE (provider_key);


--
-- Name: oauth_state oauth_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state
    ADD CONSTRAINT oauth_state_pkey PRIMARY KEY (state_id);


--
-- Name: resource resource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource
    ADD CONSTRAINT resource_pkey PRIMARY KEY (resource_id);


--
-- Name: scheduled_task_run scheduled_task_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_task_run
    ADD CONSTRAINT scheduled_task_run_pkey PRIMARY KEY (run_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (session_id);


--
-- Name: shared_memory_entry shared_memory_entry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_entry
    ADD CONSTRAINT shared_memory_entry_pkey PRIMARY KEY (entry_id);


--
-- Name: shared_memory_member shared_memory_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_member
    ADD CONSTRAINT shared_memory_member_pkey PRIMARY KEY (member_id);


--
-- Name: shared_memory_scope shared_memory_scope_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_scope
    ADD CONSTRAINT shared_memory_scope_pkey PRIMARY KEY (scope_id);


--
-- Name: skill skill_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_pkey PRIMARY KEY (skill_id);


--
-- Name: skill skill_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill
    ADD CONSTRAINT skill_slug_key UNIQUE (slug);


--
-- Name: space_member space_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_member
    ADD CONSTRAINT space_member_pkey PRIMARY KEY (id);


--
-- Name: space_message space_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_message
    ADD CONSTRAINT space_message_pkey PRIMARY KEY (message_id);


--
-- Name: space space_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space
    ADD CONSTRAINT space_pkey PRIMARY KEY (space_id);


--
-- Name: task_dependency task_dependency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependency
    ADD CONSTRAINT task_dependency_pkey PRIMARY KEY (id);


--
-- Name: task task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_pkey PRIMARY KEY (task_id);


--
-- Name: tool_execution_log tool_execution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_log
    ADD CONSTRAINT tool_execution_log_pkey PRIMARY KEY (log_id);


--
-- Name: tool_key tool_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_key
    ADD CONSTRAINT tool_key_pkey PRIMARY KEY (key_id);


--
-- Name: tool_key tool_key_tool_id_owner_id_owner_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_key
    ADD CONSTRAINT tool_key_tool_id_owner_id_owner_type_key UNIQUE (tool_id, owner_id, owner_type);


--
-- Name: tool tool_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool
    ADD CONSTRAINT tool_name_key UNIQUE (name);


--
-- Name: tool_permission tool_permission_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_permission
    ADD CONSTRAINT tool_permission_pkey1 PRIMARY KEY (id);


--
-- Name: tool tool_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool
    ADD CONSTRAINT tool_pkey PRIMARY KEY (tool_id);


--
-- Name: shared_memory_entry uq_shared_memory_entry_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_entry
    ADD CONSTRAINT uq_shared_memory_entry_version UNIQUE (scope_id, key, version);


--
-- Name: shared_memory_member uq_shared_memory_member_agent_scope; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_member
    ADD CONSTRAINT uq_shared_memory_member_agent_scope UNIQUE (scope_id, agent_id);


--
-- Name: usage_event usage_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_event
    ADD CONSTRAINT usage_event_pkey PRIMARY KEY (event_id);


--
-- Name: workflow_execution_node workflow_execution_node_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_execution_node
    ADD CONSTRAINT workflow_execution_node_pkey PRIMARY KEY (node_execution_id);


--
-- Name: workflow_execution workflow_execution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_execution
    ADD CONSTRAINT workflow_execution_pkey PRIMARY KEY (execution_id);


--
-- Name: workflow workflow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT workflow_pkey PRIMARY KEY (workflow_id);


--
-- Name: credit_ledger_entry_idempotency_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX credit_ledger_entry_idempotency_key_idx ON public.credit_ledger_entry USING btree (idempotency_key);


--
-- Name: credit_ledger_entry_principal_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_entry_principal_created_idx ON public.credit_ledger_entry USING btree (principal_id, created_at DESC);


--
-- Name: credit_ledger_entry_usage_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_entry_usage_event_idx ON public.credit_ledger_entry USING btree (usage_event_id) WHERE (usage_event_id IS NOT NULL);


--
-- Name: credit_ledger_entry_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX credit_ledger_entry_workspace_created_idx ON public.credit_ledger_entry USING btree (workspace_id, created_at DESC);


--
-- Name: idx_a2a_task_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_agent ON public.a2a_task USING btree (agent_id, created_at DESC);


--
-- Name: idx_a2a_task_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_agent_id ON public.a2a_task USING btree (agent_id);


--
-- Name: idx_a2a_task_context; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_context ON public.a2a_task USING btree (context_id) WHERE (context_id IS NOT NULL);


--
-- Name: idx_a2a_task_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_a2a_task_state ON public.a2a_task USING btree (state) WHERE (state = ANY (ARRAY['submitted'::text, 'working'::text, 'input-required'::text]));


--
-- Name: idx_activity_actor_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_actor_event ON public.activity_event USING btree (actor_id, event_type, occurred_at DESC);


--
-- Name: idx_activity_workspace_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_workspace_event ON public.activity_event USING btree (workspace_id, event_type, occurred_at DESC) WHERE (workspace_id IS NOT NULL);


--
-- Name: idx_agent_computer_config_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_computer_config_agent ON public.agent_computer_config USING btree (agent_id);


--
-- Name: idx_agent_computer_event_computer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_event_computer ON public.agent_computer_event USING btree (computer_id, created_at);


--
-- Name: idx_agent_computer_event_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_event_session ON public.agent_computer_event USING btree (session_id, created_at);


--
-- Name: idx_agent_computer_instance_agent_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_instance_agent_status ON public.agent_computer_instance USING btree (agent_id, status);


--
-- Name: idx_agent_computer_instance_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_computer_instance_canonical ON public.agent_computer_instance USING btree (agent_id) WHERE (canonical = true);


--
-- Name: idx_agent_computer_instance_commonos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_instance_commonos ON public.agent_computer_instance USING btree (common_os_agent_id);


--
-- Name: idx_agent_computer_instance_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_instance_owner ON public.agent_computer_instance USING btree (owner_user_id, agent_id) WHERE (canonical = true);


--
-- Name: idx_agent_computer_instance_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_computer_instance_session ON public.agent_computer_instance USING btree (session_id, created_at);


--
-- Name: idx_agent_log_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_agent_id ON public.agent_log USING btree (agent_id);


--
-- Name: idx_agent_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_created_at ON public.agent_log USING btree (agent_id, created_at DESC);


--
-- Name: idx_agent_log_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_log_session_id ON public.agent_log USING btree (session_id);


--
-- Name: idx_agent_memory_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_active ON public.agent_memory USING btree (agent_id) WHERE (is_active = true);


--
-- Name: idx_agent_memory_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_agent_id ON public.agent_memory USING btree (agent_id);


--
-- Name: idx_agent_memory_importance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_importance ON public.agent_memory USING btree (agent_id, importance_score DESC);


--
-- Name: idx_agent_owner_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_owner_user_id ON public.agent USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);


--
-- Name: idx_agent_preferred_connection_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_preferred_connection_agent_id ON public.agent_preferred_connection USING btree (agent_id);


--
-- Name: idx_agent_runtime_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_runtime_type ON public.agent USING btree (runtime_type, runtime_status);


--
-- Name: idx_agent_tool_agent_tool; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_tool_agent_tool ON public.agent_tool USING btree (agent_id, tool_id);


--
-- Name: idx_agent_wallet_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_wallet_active ON public.agent_wallet USING btree (agent_id, is_active);


--
-- Name: idx_agent_wallet_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_wallet_agent_id ON public.agent_wallet USING btree (agent_id);


--
-- Name: idx_agent_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_workspace_id ON public.agent USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: idx_api_keys_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_active ON public.api_keys USING btree (principal_id) WHERE (active = true);


--
-- Name: idx_api_keys_key_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_key_hash ON public.api_keys USING btree (key_hash);


--
-- Name: idx_api_keys_principal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_principal ON public.api_keys USING btree (principal_id, principal_type);


--
-- Name: idx_api_keys_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_workspace ON public.api_keys USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);


--
-- Name: idx_file_artifact_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_artifact_file ON public.file_artifact USING btree (file_id);


--
-- Name: idx_file_artifact_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_artifact_kind ON public.file_artifact USING btree (file_id, kind);


--
-- Name: idx_file_attachment_agent_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_attachment_agent_session ON public.file_attachment USING btree (agent_id, session_id);


--
-- Name: idx_file_attachment_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_attachment_owner ON public.file_attachment USING btree (owner_id, created_at);


--
-- Name: idx_file_attachment_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_attachment_sha256 ON public.file_attachment USING btree (sha256);


--
-- Name: idx_mcp_server_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_server_owner ON public.mcp_server USING btree (owner_id, owner_type);


--
-- Name: idx_mcp_server_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_server_status ON public.mcp_server USING btree (status);


--
-- Name: idx_mcp_tool_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tool_name ON public.mcp_tool USING btree (tool_name);


--
-- Name: idx_mcp_tool_server; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcp_tool_server ON public.mcp_tool USING btree (server_id);


--
-- Name: idx_oauth_connection_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_connection_owner ON public.oauth_connection USING btree (owner_id, owner_type);


--
-- Name: idx_oauth_connection_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_connection_provider ON public.oauth_connection USING btree (provider_id);


--
-- Name: idx_oauth_connection_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_connection_status ON public.oauth_connection USING btree (status);


--
-- Name: idx_oauth_provider_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_provider_active ON public.oauth_provider USING btree (is_active);


--
-- Name: idx_oauth_provider_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_provider_key ON public.oauth_provider USING btree (provider_key);


--
-- Name: idx_oauth_state_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_state_expiry ON public.oauth_state USING btree (expires_at);


--
-- Name: idx_oauth_state_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_state_owner ON public.oauth_state USING btree (owner_id);


--
-- Name: idx_resource_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_resource_type ON public.resource USING btree (resource_type);


--
-- Name: idx_scheduled_task_run_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_task_run_due ON public.scheduled_task_run USING btree (status, scheduled_for) WHERE (status = 'pending'::text);


--
-- Name: idx_scheduled_task_run_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_task_run_pending ON public.scheduled_task_run USING btree (scheduled_for, status) WHERE (status = 'pending'::text);


--
-- Name: idx_scheduled_task_run_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_task_run_task ON public.scheduled_task_run USING btree (task_id);


--
-- Name: idx_scheduled_task_run_task_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_task_run_task_status ON public.scheduled_task_run USING btree (task_id, status);


--
-- Name: idx_session_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_agent_created ON public.session USING btree (agent_id, created_at DESC);


--
-- Name: idx_session_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_agent_id ON public.session USING btree (agent_id);


--
-- Name: idx_session_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_runtime ON public.session USING btree (agent_id, runtime_type, updated_at DESC);


--
-- Name: idx_shared_memory_entry_scope_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_memory_entry_scope_created ON public.shared_memory_entry USING btree (scope_id, created_at DESC);


--
-- Name: idx_shared_memory_member_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_memory_member_agent ON public.shared_memory_member USING btree (agent_id, scope_id);


--
-- Name: idx_shared_memory_scope_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_memory_scope_owner ON public.shared_memory_scope USING btree (owner_user_id, updated_at DESC);


--
-- Name: idx_skill_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_owner ON public.skill USING btree (owner_id, owner_type);


--
-- Name: idx_skill_public_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skill_public_active ON public.skill USING btree (is_public, is_active);


--
-- Name: idx_skill_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skill_slug ON public.skill USING btree (slug);


--
-- Name: idx_space_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_created_by ON public.space USING btree (created_by);


--
-- Name: idx_space_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_is_public ON public.space USING btree (is_public);


--
-- Name: idx_space_member_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_member_member_id ON public.space_member USING btree (member_id);


--
-- Name: idx_space_member_member_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_member_member_type ON public.space_member USING btree (member_type);


--
-- Name: idx_space_member_space_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_member_space_id ON public.space_member USING btree (space_id);


--
-- Name: idx_space_member_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_member_status ON public.space_member USING btree (status);


--
-- Name: idx_space_member_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_space_member_unique ON public.space_member USING btree (space_id, member_id, member_type);


--
-- Name: idx_space_message_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_message_created_at ON public.space_message USING btree (created_at);


--
-- Name: idx_space_message_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_message_is_deleted ON public.space_message USING btree (is_deleted);


--
-- Name: idx_space_message_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_message_sender_id ON public.space_message USING btree (sender_id);


--
-- Name: idx_space_message_space_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_message_space_id ON public.space_message USING btree (space_id);


--
-- Name: idx_space_message_target_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_message_target_type ON public.space_message USING btree (target_type);


--
-- Name: idx_space_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_space_session_id ON public.space USING btree (session_id);


--
-- Name: idx_task_agent_session_status_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_agent_session_status_priority ON public.task USING btree (agent_id, session_id, status, priority DESC, created_at);


--
-- Name: idx_task_agent_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_agent_status ON public.task USING btree (agent_id, status);


--
-- Name: idx_task_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_created_at ON public.task USING btree (created_at DESC);


--
-- Name: idx_task_cron; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_cron ON public.task USING btree (cron_expression, status) WHERE ((cron_expression IS NOT NULL) AND (is_recurring = true));


--
-- Name: idx_task_depends_on; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_depends_on ON public.task USING gin (depends_on) WHERE (depends_on IS NOT NULL);


--
-- Name: idx_task_next_run_recurring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_next_run_recurring ON public.task USING btree (next_run_at) WHERE ((is_recurring = true) AND (status <> 'cancelled'::text));


--
-- Name: idx_task_recurring_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_recurring_next_run ON public.task USING btree (is_recurring, next_run_at) WHERE ((is_recurring = true) AND (status = 'pending'::text));


--
-- Name: idx_task_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_session_id ON public.task USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_task_status_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_status_priority ON public.task USING btree (status, priority DESC, created_at);


--
-- Name: idx_task_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_workflow ON public.task USING btree (workflow_id, status) WHERE (workflow_id IS NOT NULL);


--
-- Name: idx_tool_execution_log_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_execution_log_agent ON public.tool_execution_log USING btree (agent_id, started_at DESC);


--
-- Name: idx_tool_execution_log_tool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_execution_log_tool ON public.tool_execution_log USING btree (tool_id, started_at DESC);


--
-- Name: idx_tool_key_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_key_lookup ON public.tool_key USING btree (tool_id, owner_id, owner_type, is_active);


--
-- Name: idx_tool_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tool_owner ON public.tool USING btree (owner_id) WHERE (owner_id IS NOT NULL);


--
-- Name: idx_usage_event_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_event_agent_id ON public.usage_event USING btree (agent_id);


--
-- Name: idx_usage_event_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_event_created_at ON public.usage_event USING btree (created_at DESC);


--
-- Name: idx_usage_event_runtime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_event_runtime ON public.usage_event USING btree (agent_id, runtime_type, created_at DESC);


--
-- Name: idx_usage_event_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_event_session_id ON public.usage_event USING btree (session_id);


--
-- Name: idx_usage_event_trace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_event_trace_id ON public.usage_event USING btree (trace_id) WHERE (trace_id IS NOT NULL);


--
-- Name: idx_workflow_execution_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_agent ON public.workflow_execution USING btree (agent_id, started_at DESC);


--
-- Name: idx_workflow_execution_agent_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_agent_status ON public.workflow_execution USING btree (agent_id, status) WHERE (agent_id IS NOT NULL);


--
-- Name: idx_workflow_execution_approval_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workflow_execution_approval_token ON public.workflow_execution USING btree (approval_token) WHERE (approval_token IS NOT NULL);


--
-- Name: idx_workflow_execution_node_execution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_node_execution ON public.workflow_execution_node USING btree (execution_id, node_id);


--
-- Name: idx_workflow_execution_node_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_node_status ON public.workflow_execution_node USING btree (execution_id, status);


--
-- Name: idx_workflow_execution_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_status ON public.workflow_execution USING btree (status, started_at DESC);


--
-- Name: idx_workflow_execution_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_task ON public.workflow_execution USING btree (task_id);


--
-- Name: idx_workflow_execution_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_workflow ON public.workflow_execution USING btree (workflow_id, started_at DESC);


--
-- Name: idx_workflow_execution_workflow_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_execution_workflow_status ON public.workflow_execution USING btree (workflow_id, status);


--
-- Name: idx_workflow_forked_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_forked_from ON public.workflow USING btree (forked_from_id);


--
-- Name: idx_workflow_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_owner ON public.workflow USING btree (owner_id, owner_type);


--
-- Name: idx_workflow_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_public ON public.workflow USING btree (is_public, category);


--
-- Name: agent_memory agent_memory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agent_memory_updated_at BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.update_agent_memory_timestamp();


--
-- Name: agent_wallet agent_wallet_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER agent_wallet_updated_at BEFORE UPDATE ON public.agent_wallet FOR EACH ROW EXECUTE FUNCTION public.update_agent_wallet_timestamp();


--
-- Name: file_attachment file_attachment_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER file_attachment_updated_at BEFORE UPDATE ON public.file_attachment FOR EACH ROW EXECUTE FUNCTION public.update_file_attachment_timestamp();


--
-- Name: tool_key tool_key_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tool_key_updated_at BEFORE UPDATE ON public.tool_key FOR EACH ROW EXECUTE FUNCTION public.update_tool_key_timestamp();


--
-- Name: tool tool_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tool_updated_at BEFORE UPDATE ON public.tool FOR EACH ROW EXECUTE FUNCTION public.update_tool_timestamp();


--
-- Name: workflow workflow_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workflow_updated_at BEFORE UPDATE ON public.workflow FOR EACH ROW EXECUTE FUNCTION public.update_workflow_timestamp();


--
-- Name: a2a_task a2a_task_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_task
    ADD CONSTRAINT a2a_task_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: a2a_task a2a_task_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.a2a_task
    ADD CONSTRAINT a2a_task_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: agent_computer_config agent_computer_config_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_config
    ADD CONSTRAINT agent_computer_config_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: agent_computer_event agent_computer_event_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_event
    ADD CONSTRAINT agent_computer_event_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: agent_computer_event agent_computer_event_computer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_event
    ADD CONSTRAINT agent_computer_event_computer_id_fkey FOREIGN KEY (computer_id) REFERENCES public.agent_computer_instance(computer_id) ON DELETE CASCADE;


--
-- Name: agent_computer_event agent_computer_event_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_event
    ADD CONSTRAINT agent_computer_event_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: agent_computer_instance agent_computer_instance_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_instance
    ADD CONSTRAINT agent_computer_instance_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: agent_computer_instance agent_computer_instance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_computer_instance
    ADD CONSTRAINT agent_computer_instance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: agent_memory agent_memory_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: agent_memory agent_memory_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_memory
    ADD CONSTRAINT agent_memory_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: agent_tool agent_tool_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool
    ADD CONSTRAINT agent_tool_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: agent_tool agent_tool_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_tool
    ADD CONSTRAINT agent_tool_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.tool(tool_id) ON DELETE CASCADE;


--
-- Name: agent_wallet agent_wallet_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallet
    ADD CONSTRAINT agent_wallet_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: file_artifact file_artifact_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_artifact
    ADD CONSTRAINT file_artifact_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.file_attachment(file_id) ON DELETE CASCADE;


--
-- Name: file_attachment file_attachment_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_attachment
    ADD CONSTRAINT file_attachment_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE SET NULL;


--
-- Name: file_attachment file_attachment_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_attachment
    ADD CONSTRAINT file_attachment_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: mcp_tool mcp_tool_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool
    ADD CONSTRAINT mcp_tool_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.mcp_server(server_id) ON DELETE CASCADE;


--
-- Name: oauth_connection oauth_connection_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_connection
    ADD CONSTRAINT oauth_connection_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.oauth_provider(provider_id) ON DELETE CASCADE;


--
-- Name: oauth_state oauth_state_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_state
    ADD CONSTRAINT oauth_state_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.oauth_provider(provider_id) ON DELETE CASCADE;


--
-- Name: scheduled_task_run scheduled_task_run_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_task_run
    ADD CONSTRAINT scheduled_task_run_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: scheduled_task_run scheduled_task_run_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_task_run
    ADD CONSTRAINT scheduled_task_run_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task(task_id) ON DELETE CASCADE;


--
-- Name: shared_memory_entry shared_memory_entry_authored_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_entry
    ADD CONSTRAINT shared_memory_entry_authored_by_agent_id_fkey FOREIGN KEY (authored_by_agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: shared_memory_entry shared_memory_entry_authored_by_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_entry
    ADD CONSTRAINT shared_memory_entry_authored_by_session_id_fkey FOREIGN KEY (authored_by_session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: shared_memory_entry shared_memory_entry_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_entry
    ADD CONSTRAINT shared_memory_entry_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.shared_memory_scope(scope_id) ON DELETE CASCADE;


--
-- Name: shared_memory_member shared_memory_member_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_member
    ADD CONSTRAINT shared_memory_member_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: shared_memory_member shared_memory_member_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_memory_member
    ADD CONSTRAINT shared_memory_member_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.shared_memory_scope(scope_id) ON DELETE CASCADE;


--
-- Name: space_member space_member_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_member
    ADD CONSTRAINT space_member_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.space(space_id) ON DELETE CASCADE;


--
-- Name: space_message space_message_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space_message
    ADD CONSTRAINT space_message_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.space(space_id) ON DELETE CASCADE;


--
-- Name: space space_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.space
    ADD CONSTRAINT space_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id);


--
-- Name: task task_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task
    ADD CONSTRAINT task_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow(workflow_id) ON DELETE SET NULL;


--
-- Name: tool_execution_log tool_execution_log_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_log
    ADD CONSTRAINT tool_execution_log_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: tool_execution_log tool_execution_log_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_log
    ADD CONSTRAINT tool_execution_log_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.tool_key(key_id) ON DELETE SET NULL;


--
-- Name: tool_execution_log tool_execution_log_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_log
    ADD CONSTRAINT tool_execution_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE CASCADE;


--
-- Name: tool_execution_log tool_execution_log_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_execution_log
    ADD CONSTRAINT tool_execution_log_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.tool(tool_id) ON DELETE CASCADE;


--
-- Name: tool_key tool_key_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_key
    ADD CONSTRAINT tool_key_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.tool(tool_id) ON DELETE CASCADE;


--
-- Name: tool_permission tool_permission_tool_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_permission
    ADD CONSTRAINT tool_permission_tool_id_fkey1 FOREIGN KEY (tool_id) REFERENCES public.tool(tool_id) ON DELETE CASCADE;


--
-- Name: usage_event usage_event_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_event
    ADD CONSTRAINT usage_event_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agent(agent_id) ON DELETE CASCADE;


--
-- Name: usage_event usage_event_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_event
    ADD CONSTRAINT usage_event_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.session(session_id) ON DELETE SET NULL;


--
-- Name: usage_event usage_event_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_event
    ADD CONSTRAINT usage_event_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.task(task_id) ON DELETE SET NULL;


--
-- Name: usage_event usage_event_workflow_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_event
    ADD CONSTRAINT usage_event_workflow_execution_id_fkey FOREIGN KEY (workflow_execution_id) REFERENCES public.workflow_execution(execution_id) ON DELETE SET NULL;


--
-- Name: workflow_execution_node workflow_execution_node_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_execution_node
    ADD CONSTRAINT workflow_execution_node_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_execution(execution_id) ON DELETE CASCADE;


--
-- Name: workflow_execution workflow_execution_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_execution
    ADD CONSTRAINT workflow_execution_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow(workflow_id) ON DELETE CASCADE;


--
-- Name: workflow workflow_forked_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow
    ADD CONSTRAINT workflow_forked_from_id_fkey FOREIGN KEY (forked_from_id) REFERENCES public.workflow(workflow_id);


--
-- Name: agent_preferred_connection; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_preferred_connection ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_tool; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_tool ENABLE ROW LEVEL SECURITY;

--
-- Name: goal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal ENABLE ROW LEVEL SECURITY;

--
-- Name: task; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task ENABLE ROW LEVEL SECURITY;

--
-- Name: task_dependency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_dependency ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict sh6Zs302Eg4CwGekBvYztnWF1gvhS9q63KXocNsphZtXGZTU1qW4LtaFiJ0cDaj

