create table if not exists commons_user_profile_override (
  user_id text primary key references "user"(id) on delete cascade,
  display_name text,
  image_url text,
  updated_at timestamptz not null default now()
);
