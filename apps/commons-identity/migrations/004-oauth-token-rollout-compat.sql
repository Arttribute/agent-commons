-- Keep the previous Identity revision compatible during the rolling deployment
-- that removes its obsolete revoked-column predicate.
alter table "oauthAccessToken"
  add column if not exists revoked timestamptz;
