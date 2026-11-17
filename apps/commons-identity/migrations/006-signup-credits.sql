create table if not exists commons_signup_credit_grant (
  user_id text primary key references "user"(id) on delete cascade,
  signed_up_at timestamptz not null,
  delivered_at timestamptz,
  attempts integer not null default 0,
  last_attempt_at timestamptz
);
create index if not exists commons_signup_credit_grant_pending
  on commons_signup_credit_grant (signed_up_at) where delivered_at is null;
