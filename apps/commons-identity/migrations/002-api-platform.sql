create table if not exists commons_project (
  id text primary key,
  workspace_id text not null references commons_workspace(id) on delete cascade,
  created_by_user_id text not null references "user"(id) on delete restrict,
  name text not null,
  slug text not null,
  environment text not null default 'production'
    check (environment in ('development', 'staging', 'production')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists commons_project_api_key (
  id text primary key,
  project_id text not null references commons_project(id) on delete cascade,
  key_prefix text not null,
  key_hash text not null unique,
  name text not null,
  scopes text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_user_id text not null references "user"(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists commons_project_api_key_project_idx
  on commons_project_api_key(project_id, status);

create table if not exists commons_api_usage_event (
  id bigserial primary key,
  request_id text not null unique,
  project_id text,
  workspace_id text,
  actor_id text,
  actor_type text,
  service text not null,
  method text not null,
  path text not null,
  status_code integer not null,
  duration_ms integer not null,
  response_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists commons_api_usage_project_created_idx
  on commons_api_usage_event(project_id, created_at desc);
