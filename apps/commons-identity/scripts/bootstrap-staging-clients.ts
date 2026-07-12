// One-off: create dedicated STAGING OAuth clients so the staging frontend has
// its own credentials (rather than reusing prod's). Additive — does not touch
// existing clients. Run with DATABASE_URL pointed at the identity DB.
import { pool } from "../lib/db";
import { ensureOAuthClient } from "../lib/oauth-client-store";

const APP_URL =
  process.env.STAGING_APP_URL ?? "https://staging.agentcommons.io";

async function main() {
  const out: Record<string, unknown> = {};

  out.agentCommonsStaging = await ensureOAuthClient(pool, {
    name: "Agent Commons Staging",
    clientUri: APP_URL,
    redirectUris: [`${APP_URL}/api/auth/callback/commons`],
    postLogoutRedirectUris: [APP_URL],
    grantTypes: ["authorization_code", "refresh_token"],
    requirePkce: true,
    skipConsent: true,
    metadata: { application: "agentCommonsStaging" },
  });

  out.agentCommonsServiceStaging = await ensureOAuthClient(pool, {
    name: "Agent Commons Service Staging",
    redirectUris: ["https://invalid.local/service"],
    grantTypes: ["client_credentials"],
    requirePkce: false,
    skipConsent: true,
    metadata: {
      application: "agentCommonsServiceStaging",
      serviceAccountId: "svc_agent_commons_staging",
    },
  });

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
