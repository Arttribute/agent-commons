create table if not exists commons_workspace (
  id text primary key,
  name text not null,
  slug text not null unique,
  kind text not null default 'personal'
    check (kind in ('personal', 'team', 'education')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commons_workspace_membership (
  id text primary key,
  workspace_id text not null references commons_workspace(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists commons_identity_alias (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  source text not null,
  source_subject text not null,
  email text,
  email_verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, source_subject)
);

create index if not exists commons_identity_alias_email_idx
  on commons_identity_alias (lower(email))
  where email is not null;

create table if not exists commons_service_account (
  id text primary key,
  workspace_id text references commons_workspace(id) on delete cascade,
  name text not null,
  scopes text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commons_migration_audit (
  id bigserial primary key,
  migration_key text not null unique,
  source text not null,
  source_subject text not null,
  target_user_id text references "user"(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
