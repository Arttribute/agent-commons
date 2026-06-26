create extension if not exists "uuid-ossp";

create table if not exists credit_ledger_entry (
  entry_id uuid primary key default gen_random_uuid(),
  principal_id text not null,
  principal_type text not null default 'user',
  workspace_id text,
  amount integer not null,
  currency text not null default 'credits',
  direction text not null,
  event_type text not null,
  source_platform text not null,
  idempotency_key text not null,
  description text,
  related_course_id text,
  related_challenge_id text,
  agent_id text,
  session_id uuid,
  task_id uuid,
  workflow_id uuid,
  usage_event_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_by text,
  created_by_type text default 'service',
  expires_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists credit_ledger_entry_idempotency_key_idx
  on credit_ledger_entry (idempotency_key);

create index if not exists credit_ledger_entry_principal_created_idx
  on credit_ledger_entry (principal_id, created_at desc);

create index if not exists credit_ledger_entry_workspace_created_idx
  on credit_ledger_entry (workspace_id, created_at desc);

create index if not exists credit_ledger_entry_usage_event_idx
  on credit_ledger_entry (usage_event_id)
  where usage_event_id is not null;
