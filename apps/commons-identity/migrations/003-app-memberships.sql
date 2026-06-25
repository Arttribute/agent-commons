create table if not exists commons_app_membership (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  app_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, app_id)
);

create index if not exists commons_app_membership_app_idx
  on commons_app_membership(app_id, first_seen_at desc);
