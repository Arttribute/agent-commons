import { createHash, randomBytes, randomUUID } from "crypto";

type Database = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, any>> }>;
};

export type OAuthClientRecordInput = {
  clientId?: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  clientUri?: string;
  grantTypes: Array<"authorization_code" | "refresh_token" | "client_credentials">;
  scopes?: string[];
  requirePkce?: boolean;
  skipConsent?: boolean;
  metadata?: Record<string, unknown>;
};

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export async function ensureOAuthClient(
  database: Database,
  input: OAuthClientRecordInput,
) {
  const existing = await database.query(
    `select "clientId", name from "oauthClient" where name = $1 limit 1`,
    [input.name],
  );
  if (existing.rows[0]) {
    return {
      client_id: existing.rows[0].clientId as string,
      existing: true as const,
    };
  }

  const clientId =
    input.clientId ?? `cc_${randomBytes(24).toString("base64url")}`;
  const clientSecret =
    input.clientSecret ?? `ccs_${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  await database.query(
    `insert into "oauthClient"
      (id, "clientId", "clientSecret", disabled, "skipConsent",
       "enableEndSession", "subjectType", scopes, "createdAt", "updatedAt",
       name, uri, "redirectUris", "postLogoutRedirectUris",
       "tokenEndpointAuthMethod", "grantTypes", "responseTypes",
       public, type, "requirePKCE", metadata)
     values
      ($1, $2, $3, false, $4, true, 'public', $5::jsonb, $6, $6,
       $7, $8, $9::jsonb, $10::jsonb, 'client_secret_basic',
       $11::jsonb, '["code"]'::jsonb, false, 'web', $12, $13::jsonb)`,
    [
      randomUUID(),
      clientId,
      hashSecret(clientSecret),
      input.skipConsent ?? true,
      JSON.stringify(
        input.scopes ?? [
          "openid",
          "profile",
          "email",
          "offline_access",
          "activity:read",
          "agents:create",
          "agents:read",
          "agents:write",
          "agents:run",
          "compute:read",
          "compute:write",
          "usage:read",
        ],
      ),
      now,
      input.name,
      input.clientUri ?? null,
      JSON.stringify(input.redirectUris),
      JSON.stringify(input.postLogoutRedirectUris ?? []),
      JSON.stringify(input.grantTypes),
      input.requirePkce ?? input.grantTypes.includes("authorization_code"),
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return {
    client_id: clientId,
    client_secret: clientSecret,
    existing: false as const,
  };
}
