import { readFile } from "fs/promises";
import { resolve } from "path";
import { createHash } from "crypto";
import { betterAuth } from "better-auth";
import { DataType, newDb } from "pg-mem";

process.env.COMMONS_IDENTITY_NO_LISTEN = "true";
process.env.BETTER_AUTH_URL = "http://identity.test";
process.env.COMMONS_IDENTITY_ISSUER = "http://identity.test/api/auth";
process.env.BETTER_AUTH_SECRET =
  "test-secret-that-is-deliberately-longer-than-thirty-two-characters";

const memory = newDb();
memory.public.registerFunction({
  name: "md5",
  args: [DataType.text],
  returns: DataType.text,
  implementation: (value: string) =>
    createHash("md5").update(value).digest("hex"),
});
const adapter = memory.adapters.createPg();
const database = new adapter.Pool();
await database.query(
  await readFile(resolve("migrations/better-auth.sql"), "utf8"),
);
await database.query(
  await readFile(resolve("migrations/001-commons-identity-domain.sql"), "utf8"),
);
await database.query(
  await readFile(resolve("migrations/002-api-platform.sql"), "utf8"),
);

const { commonsAuthOptions } = await import("../lib/auth-config");
const { ensureOAuthClient } = await import("../lib/oauth-client-store");
const auth = betterAuth(commonsAuthOptions(database));
const { createIdentityApp } = await import("../src/index");
const app = createIdentityApp(auth as never, database as never);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const health = await app.request("http://identity.test/health");
assert(health.ok, "health endpoint failed");

const discovery = await app.request(
  "http://identity.test/api/auth/.well-known/openid-configuration",
);
assert(discovery.ok, `OIDC discovery failed: ${discovery.status}`);
const authorizationServerMetadata = await app.request(
  "http://identity.test/.well-known/oauth-authorization-server/api/auth",
);
assert(
  authorizationServerMetadata.ok,
  `OAuth authorization-server metadata failed: ${authorizationServerMetadata.status}`,
);

const webClient = await ensureOAuthClient(database, {
  name: "E2E Web",
  redirectUris: ["http://localhost:3999/api/auth/callback/commons"],
  grantTypes: ["authorization_code", "refresh_token"],
  requirePkce: true,
  skipConsent: true,
});
const authorize = await app.request(
  `http://identity.test/api/auth/oauth2/authorize?${new URLSearchParams({
    client_id: webClient.client_id,
    redirect_uri: "http://localhost:3999/api/auth/callback/commons",
    response_type: "code",
    scope: "openid email profile",
    state: "e2e-state",
    code_challenge: "0123456789012345678901234567890123456789012",
    code_challenge_method: "S256",
    resource: "commons-platform",
  })}`,
  { redirect: "manual" },
);
assert(
  authorize.status === 302 && authorize.headers.get("location")?.includes("/sign-in"),
  `authorization did not redirect to sign-in: ${authorize.status}`,
);

const signup = await app.request("http://identity.test/api/auth/sign-up/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Identity Test",
    email: "identity-test@example.com",
    password: "correct-horse-battery-staple",
  }),
});
assert(signup.ok, `email signup failed: ${signup.status} ${await signup.text()}`);

const user = await database.query(
  `select id, "defaultWorkspaceId" from "user" where email = $1`,
  ["identity-test@example.com"],
);
assert(user.rows[0]?.id?.startsWith("usr_"), "canonical user ID was not created");
assert(
  user.rows[0]?.defaultWorkspaceId?.startsWith("wsp_"),
  "personal workspace was not created",
);

const device = await app.request("http://identity.test/api/auth/device/code", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: "commons-cli",
    scope: "openid profile email",
  }),
});
assert(device.ok, `device authorization failed: ${device.status}`);
const deviceBody = await device.json();
assert(deviceBody.user_code && deviceBody.device_code, "device codes missing");

const jwks = await app.request(
  "http://identity.test/api/auth/.well-known/jwks.json",
);
assert(jwks.ok, `JWKS endpoint failed: ${jwks.status}`);

const serviceClient = await ensureOAuthClient(database, {
  name: "E2E Service",
  redirectUris: ["https://invalid.local/service"],
  grantTypes: ["client_credentials"],
  metadata: { serviceAccountId: "svc_e2e" },
});
const serviceTokenResponse = await app.request(
  "http://identity.test/api/auth/oauth2/token",
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${serviceClient.client_id}:${serviceClient.client_secret}`,
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "activity:read",
      resource: "commons-platform",
    }).toString(),
  },
);
if (!serviceTokenResponse.ok) {
  throw new Error(
    `client credentials failed: ${serviceTokenResponse.status} ${await serviceTokenResponse.text()}`,
  );
}
const serviceToken = (await serviceTokenResponse.json()) as {
  access_token?: string;
};
const serviceClaims = JSON.parse(
  Buffer.from(serviceToken.access_token!.split(".")[1]!, "base64url").toString("utf8"),
) as Record<string, unknown>;
assert(
  serviceClaims.azp === serviceClient.client_id,
  `service token subject is incorrect: ${JSON.stringify(serviceClaims)}`,
);
assert(serviceClaims.actor_type === "service", "service actor type is missing");

console.log(
  JSON.stringify(
    {
      health: true,
      discovery: true,
      authorizationServerMetadata: true,
      authorizationCodePkce: true,
      canonicalUser: user.rows[0].id,
      workspace: user.rows[0].defaultWorkspaceId,
      deviceAuthorization: true,
      jwks: true,
      clientCredentials: true,
    },
    null,
    2,
  ),
);
await database.end();
