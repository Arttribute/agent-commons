import { oauthProvider } from "@better-auth/oauth-provider";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { createCommonsId } from "@/lib/ids";

const AUTH_SESSION_VERSION = (
  process.env.COMMONS_AUTH_SESSION_VERSION ?? "v2"
).replace(/[^a-zA-Z0-9_-]/g, "-");

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

type IdentityEmailBrand = {
  from: string;
  product: string;
  subject: string;
  heading: string;
  body: string;
};

function appFromVerificationUrl(url: string): string | null {
  try {
    const verificationUrl = new URL(url);
    const callbackURL =
      verificationUrl.searchParams.get("callbackURL") ??
      verificationUrl.searchParams.get("callbackUrl");
    if (!callbackURL) return null;
    const callback = new URL(callbackURL);
    return callback.searchParams.get("commons_app");
  } catch {
    return null;
  }
}

export function appEmailBrand(app: string | null): IdentityEmailBrand {
  switch (app) {
    case "commonlabs":
      return {
        from:
          process.env.COMMON_LABS_ONBOARDING_FROM_EMAIL ??
          "CommonLab <no-reply-commonlabs@agentcommons.io>",
        product: "CommonLab",
        subject: "Verify your CommonLab account",
        heading: "Welcome to CommonLab",
        body: "Verify your email to continue learning and building with CommonLab.",
      };
    case "agent-commons":
      return {
        from:
          process.env.AGENT_COMMONS_ONBOARDING_FROM_EMAIL ??
          "Agent Commons <onboarding-agentcommons@agentcommons.io>",
        product: "Agent Commons",
        subject: "Verify your Agent Commons account",
        heading: "Welcome to Agent Commons",
        body: "Verify your email to start creating and running agents.",
      };
    case "common-os":
      return {
        from:
          process.env.COMMON_OS_ONBOARDING_FROM_EMAIL ??
          "CommonOS <onboarding-commonos@agentcommons.io>",
        product: "CommonOS",
        subject: "Verify your CommonOS account",
        heading: "Welcome to CommonOS",
        body: "Verify your email to access your fleets and agent compute.",
      };
    default:
      return {
        from:
          process.env.IDENTITY_ONBOARDING_FROM_EMAIL ??
          process.env.IDENTITY_FROM_EMAIL ??
          "Commons Accounts <onboarding@agentcommons.io>",
        product: "Commons",
        subject: "Verify your Commons account",
        heading: "Verify your Commons account",
        body: "One account gives you access to every Commons product.",
      };
  }
}

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
          from:
            process.env.IDENTITY_SECURITY_FROM_EMAIL ??
            "Commons Security <security@agentcommons.io>",
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
        const brand = appEmailBrand(appFromVerificationUrl(url));
        await sendIdentityEmail({
          to: user.email,
          from: brand.from,
          subject: brand.subject,
          heading: brand.heading,
          body: brand.body,
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
      cookiePrefix: `commons-identity-${AUTH_SESSION_VERSION}`,
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
            picture: user.image,
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
          picture: user?.image,
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

export async function sendIdentityEmail(input: {
  to: string;
  from: string;
  subject: string;
  heading: string;
  body: string;
  url: string;
  template?: "commonlab" | "default";
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[identity-email] ${input.subject}: ${input.url}`);
      return;
    }
    throw new Error("RESEND_API_KEY is required to send identity emails.");
  }
  const commonLabHtml = `
    <div style="margin:0;padding:32px 16px;background:#f8fafc;color:#020617;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <tr>
              <td style="height:8px;background:linear-gradient(90deg,#B8F56D 0 25%,#71E0E7 25% 50%,#9FB0F4 50% 75%,#F3A2B4 75%)"></td>
            </tr>
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #e2e8f0">
                <div style="font-size:20px;font-weight:800">CommonLab</div>
                <div style="margin-top:3px;color:#64748b;font-size:12px;font-weight:600">Courses and learning sandboxes</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 30px 30px">
                <div style="margin-bottom:10px;color:#475569;font-size:14px;font-weight:700">Welcome</div>
                <h1 style="margin:0 0 16px;font-size:32px;line-height:1.15">${input.heading}</h1>
                <p style="margin:0 0 18px;color:#475569;font-size:16px;line-height:1.65">${input.body}</p>
                <p style="margin:0 0 26px;color:#475569;font-size:15px;line-height:1.65">Explore structured courses, hands-on assignments, and guided agent-building practice at your own pace.</p>
                <a href="${input.url}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#020617;color:#fff;text-decoration:none;font-size:14px;font-weight:800">Explore CommonLab</a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">
                You are receiving this because you signed in to CommonLab.
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html:
        input.template === "commonlab"
          ? commonLabHtml
          : `<h1>${input.heading}</h1><p>${input.body}</p><p><a href="${input.url}">Continue</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Identity email failed with status ${response.status}`);
  }
}
