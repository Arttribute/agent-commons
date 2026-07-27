-- OAuth providers such as GitHub OAuth Apps can issue a usable access token
-- without a refresh token. Store that state directly instead of encrypting an
-- empty string as a fake refresh token.
ALTER TABLE oauth_connection
  ALTER COLUMN encrypted_refresh_token DROP NOT NULL,
  ALTER COLUMN refresh_token_iv DROP NOT NULL,
  ALTER COLUMN refresh_token_tag DROP NOT NULL;
