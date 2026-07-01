import { pool } from "../lib/db";
import { ensureOAuthClient } from "../lib/oauth-client-store";

type ClientInput = {
  key: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  clientUri?: string;
  serviceAccountId?: string;
  workspaceId?: string;
};

const clients: ClientInput[] = [
  {
    key: "agentCommons",
    name: "Agent Commons",
    redirectUris: [
      process.env.AGENT_COMMONS_OAUTH_REDIRECT_URI ??
        "http://localhost:3000/api/auth/callback/commons",
    ],
    postLogoutRedirectUris: [
      process.env.AGENT_COMMONS_LOGOUT_REDIRECT_URI ?? "http://localhost:3000",
    ],
    clientUri: process.env.AGENT_COMMONS_APP_URL ?? "http://localhost:3000",
  },
  {
    key: "agentCommonsService",
    name: "Agent Commons Service",
    redirectUris: ["https://invalid.local/service"],
    serviceAccountId: "svc_agent_commons",
  },
  {
    key: "courses",
    name: "Commons Courses",
    redirectUris: [
      process.env.COURSES_OAUTH_REDIRECT_URI ??
        "http://localhost:3002/api/auth/callback/commons",
    ],
    postLogoutRedirectUris: [
      process.env.COURSES_LOGOUT_REDIRECT_URI ?? "http://localhost:3002",
    ],
    clientUri: process.env.COURSES_APP_URL ?? "http://localhost:3002",
  },
  {
    key: "commonOs",
    name: "Common OS",
    redirectUris: [
      process.env.COMMON_OS_OAUTH_REDIRECT_URI ??
        "http://localhost:3003/api/auth/callback/commons",
    ],
    postLogoutRedirectUris: [
      process.env.COMMON_OS_LOGOUT_REDIRECT_URI ?? "http://localhost:3003",
    ],
    clientUri: process.env.COMMON_OS_APP_URL ?? "http://localhost:3003",
  },
  {
    key: "coursesVerifier",
    name: "Commons Courses Verifier",
    redirectUris: ["https://invalid.local/service"],
    serviceAccountId: "svc_courses_verifier",
  },
  {
    key: "commonOsControlPlane",
    name: "Common OS Control Plane",
    redirectUris: ["https://invalid.local/service"],
    serviceAccountId: "svc_common_os_control_plane",
  },
];

async function main() {
  const output: Record<string, unknown> = {};
  for (const client of clients) {
    const created = await ensureOAuthClient(pool, {
      name: client.name,
      clientUri: client.clientUri,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris,
      grantTypes: client.serviceAccountId
          ? ["client_credentials"]
          : ["authorization_code", "refresh_token"],
      requirePkce: !client.serviceAccountId,
      skipConsent: true,
      metadata: {
        application: client.key,
        ...(client.serviceAccountId
          ? {
              serviceAccountId: client.serviceAccountId,
              workspaceId: client.workspaceId,
            }
          : {}),
      },
    });
    output[client.key] = created.existing
      ? {
          ...created,
          note: "Secret is not recoverable; load it from AWS Secrets Manager.",
        }
      : created;
  }
  console.log(JSON.stringify(output, null, 2));
  console.warn(
    "Store each client_secret in AWS Secrets Manager now. Better Auth returns it only at creation.",
  );
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
