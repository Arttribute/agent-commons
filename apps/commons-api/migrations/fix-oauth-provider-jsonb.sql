-- Repairs oauth_provider rows whose jsonb columns were stored as JSON *string
-- scalars* instead of objects (caused by JSON.stringify-ing values passed to
-- postgres.js, which then encodes the string itself as jsonb).
--
-- Symptoms while broken:
--   * provider.scopes.default is undefined → default-scope flows request no scopes
--   * Object.entries(authorization_params) iterates characters → Google never
--     receives access_type=offline / prompt=consent → NO REFRESH TOKEN issued,
--     so connections die when the first access token expires (~1 hour)
--
-- Safe to run repeatedly: only touches rows where the value is a string scalar
-- that parses as JSON.

UPDATE oauth_provider
SET scopes = (scopes #>> '{}')::jsonb
WHERE jsonb_typeof(scopes) = 'string';

UPDATE oauth_provider
SET authorization_params = (authorization_params #>> '{}')::jsonb
WHERE jsonb_typeof(authorization_params) = 'string';

UPDATE oauth_provider
SET token_params = (token_params #>> '{}')::jsonb
WHERE jsonb_typeof(token_params) = 'string';
