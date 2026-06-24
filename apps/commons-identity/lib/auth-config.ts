import { oauthProvider } from "@better-auth/oauth-provider";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { createCommonsId } from "@/lib/ids";

type QueryableDatabase = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
  connect?: () => Promise<{
    query: QueryableDatabase["query"];
    release: () => void;
  }>;
};

type IdentityEmailContext = {
  user: { email: string };
  url: string;
};

function workspaceSlug(email: string) {
  const base = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "user"}-${crypto.randomUUID().slice(0, 8)}`;
}

export function commonsAuthOptions(database: unknown) {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3010";
  const issuer =
    process.env.COMMONS_IDENTITY_ISSUER ?? `${baseURL}/api/auth`;
  const trustedOrigins = (process.env.COMMONS_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const googleEnabled =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET);

  return {
    appName: "Commons",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }: IdentityEmailContext) => {
        await sendIdentityEmail({
          to: user.email,
          subject: "Reset your Commons password",
          heading: "Reset your Commons password",
          body: "Use the secure link below to choose a new password.",
          url,
        });
      },
      password: {
        hash: (password: string) => bcrypt.hash(password, 12),
        verify: ({ hash, password }: { hash: string; password: string }) =>
          bcrypt.compare(password, hash),
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: IdentityEmailContext) => {
        await sendIdentityEmail({
          to: user.email,
          subject: "Verify your Commons account",
          heading: "Verify your Commons account",
          body: "One account gives you access to Commons Courses, Agent Commons, Common OS, and the CLI.",
          url,
        });
      },
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {},
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    advanced: {
      database: {
        generateId: ({ model }: { model: string }) => {
          if (model === "user" || model === "users") {
            return createCommonsId("user");
          }
          return crypto.randomUUID();
        },
      },
    },
    user: {
      additionalFields: {
        defaultWorkspaceId: {
          type: "string" as const,
          input: false,
          required: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; name: string; email: string }) => {
            const db = database as QueryableDatabase;
            const client = db.connect ? await db.connect() : null;
            const query = client?.query.bind(client) ?? db.query.bind(db);
            const workspaceId = createCommonsId("workspace");
            await query("begin");
            try {
              await query(
                `insert into commons_workspace (id, name, slug, kind)
                 values ($1, $2, $3, 'personal')`,
                [
                  workspaceId,
                  `${user.name || user.email.split("@")[0]}'s workspace`,
                  workspaceSlug(user.email),
                ],
              );
              await query(
                `insert into commons_workspace_membership
                 (id, workspace_id, user_id, role, status)
                 values ($1, $2, $3, 'owner', 'active')`,
                [createCommonsId("membership"), workspaceId, user.id],
              );
              await query(
                `update "user" set "defaultWorkspaceId" = $2 where id = $1`,
                [user.id, workspaceId],
              );
              await query(
                `insert into commons_project
                 (id, workspace_id, created_by_user_id, name, slug, environment)
                 values ($1, $2, $3, 'Default project', $4, 'production')`,
                [
                  createCommonsId("project"),
                  workspaceId,
                  user.id,
                  `default-${crypto.randomUUID().slice(0, 8)}`,
                ],
              );
              await query("commit");
            } catch (error) {
              await query("rollback");
              throw error;
            } finally {
              client?.release();
            }
          },
        },
      },
    },
    plugins: [
      bearer(),
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          jwksPath: "/.well-known/jwks.json",
          keyPairConfig: { alg: "ES256" },
          rotationInterval: 60 * 60 * 24 * 30,
          gracePeriod: 60 * 60 * 24 * 30,
        },
        jwt: {
          issuer,
          audience: "commons-platform",
          expirationTime: "15m",
          definePayload: ({ user }) => ({
            sub: user.id,
            email: user.email,
            email_verified: user.emailVerified,
            name: user.name,
            workspace_id:
              (user as { defaultWorkspaceId?: string }).defaultWorkspaceId ??
              null,
            actor_type: "user",
          }),
        },
      }),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        scopes: [
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
        validAudiences: ["commons-platform"],
        accessTokenExpiresIn: 15 * 60,
        m2mAccessTokenExpiresIn: 10 * 60,
        silenceWarnings: {
          oauthAuthServerConfig: true,
        },
        customAccessTokenClaims: ({ user, scopes, metadata }) => ({
          sub: user?.id ?? String(metadata?.serviceAccountId ?? ""),
          email: user?.email,
          email_verified: user?.emailVerified,
          name: user?.name,
          workspace_id:
            (user as { defaultWorkspaceId?: string } | undefined)
              ?.defaultWorkspaceId ??
            metadata?.workspaceId ??
            null,
          actor_type: user ? "user" : "service",
          scopes,
        }),
      }),
      deviceAuthorization({
        verificationUri: "/device",
        validateClient: async (clientId) =>
          clientId === (process.env.COMMONS_CLI_CLIENT_ID ?? "commons-cli"),
      }),
    ],
  };
}

async function sendIdentityEmail(input: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  url: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[identity-email] ${input.subject}: ${input.url}`);
      return;
    }
    throw new Error("RESEND_API_KEY is required to send identity emails.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.IDENTITY_FROM_EMAIL ??
        "Commons <accounts@agentcommons.io>",
      to: [input.to],
      subject: input.subject,
      html: `<h1>${input.heading}</h1><p>${input.body}</p><p><a href="${input.url}">Continue</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Identity email failed with status ${response.status}`);
  }
}
