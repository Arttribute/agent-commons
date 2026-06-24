alter table agent
  add column if not exists owner_user_id text,
  add column if not exists workspace_id text;

create index if not exists idx_agent_owner_user_id
  on agent (owner_user_id)
  where owner_user_id is not null;

create index if not exists idx_agent_workspace_id
  on agent (workspace_id)
  where workspace_id is not null;

alter table api_keys
  add column if not exists workspace_id text,
  add column if not exists scopes text[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists credential_type text not null default 'personal_access_token';

create index if not exists idx_api_keys_workspace
  on api_keys (workspace_id)
  where workspace_id is not null;

create table if not exists activity_event (
  event_id text primary key default gen_random_uuid()::text,
  event_type text not null,
  actor_type text not null,
  actor_id text not null,
  workspace_id text,
  subject_type text not null,
  subject_id text not null,
  source text not null default 'agent_commons',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_activity_actor_event
  on activity_event (actor_id, event_type, occurred_at desc);

create index if not exists idx_activity_workspace_event
  on activity_event (workspace_id, event_type, occurred_at desc)
  where workspace_id is not null;
