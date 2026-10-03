import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError, createEmailVerificationToken } from "better-auth/api";
import { bearer, deviceAuthorization, jwt } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { decodeJwt } from "jose";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { createCommonsId } from "@/lib/ids";
import { PLATFORM_SCOPES } from "@/lib/platform-api";

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

function appFromCallbackUrl(callbackURL: string | null): string | null {
  try {
    return callbackURL ? new URL(callbackURL).searchParams.get("commons_app") : null;
  } catch {
    return null;
  }
}

function appFromVerificationUrl(url: string): string | null {
  try {
    const verificationUrl = new URL(url);
    return appFromCallbackUrl(
      verificationUrl.searchParams.get("callbackURL") ??
        verificationUrl.searchParams.get("callbackUrl"),
    );
  } catch {
    return null;
  }
}

/** The callbackURL a sign-up or sign-in request asked to return to. */
async function requestedCallbackUrl(request?: Request) {
  const body = (await request?.json().catch(() => null)) as
    | { callbackURL?: unknown }
    | null;
  return typeof body?.callbackURL === "string" ? body.callbackURL : "/";
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
    case "common-business":
      return {
        from:
          process.env.COMMON_BUSINESS_ONBOARDING_FROM_EMAIL ??
          "Common Business <onboarding@agentcommons.io>",
        product: "Common Business",
        subject: "Verify your Common Business account",
        heading: "Welcome to Common Business",
        body: "Verify your email to open your secure business workspace.",
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
  const db = database as QueryableDatabase;

  async function sendVerificationLink(
    user: { email: string },
    url: string,
  ) {
    const brand = appEmailBrand(appFromVerificationUrl(url));
    await sendIdentityEmail({
      to: user.email,
      from: brand.from,
      subject: brand.subject,
      heading: brand.heading,
      body: brand.body,
      url,
      action: "Verify email",
    });
  }

  return {
    appName: "Commons",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database,
    trustedOrigins,
    // Production otherwise sends OAuth errors to "/?error=...", a page that
    // ignores them and whose "Sign in" link restarts the same failing flow.
    onAPIError: { errorURL: `${baseURL}/sign-in` },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // The reset link reached their inbox, which proves they own the address.
      onPasswordReset: async ({ user }: { user: { id: string } }) => {
        await db.query(
          `update "user" set "emailVerified" = true where id = $1`,
          [user.id],
        );
      },
      // Signing up with an email that already has an account succeeds without
      // saying so, to avoid revealing which emails are registered. Tell the
      // owner by email instead of leaving them waiting for nothing.
      onExistingUserSignUp: async (
        { user }: { user: { id: string; email: string; emailVerified: boolean } },
        request?: Request,
      ) => {
        const callbackURL = await requestedCallbackUrl(request);
        const accounts = await db.query(
          `select "providerId" from account where "userId" = $1`,
          [user.id],
        );
        const methods = new Set(accounts.rows.map((row) => String(row.providerId)));
        if (!user.emailVerified && methods.has("credential")) {
          const token = await createEmailVerificationToken(
            process.env.BETTER_AUTH_SECRET!,
            user.email,
          );
          await sendVerificationLink(
            user,
            `${baseURL}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
          );
          return;
        }
        const brand = appEmailBrand(appFromCallbackUrl(callbackURL));
        await sendIdentityEmail({
          to: user.email,
          from: brand.from,
          subject: `You already have a ${brand.product} account`,
          heading: "You already have an account",
          body: methods.has("google")
            ? "Someone, probably you, tried to create an account with this email. Sign in with Continue with Google, or reset your password below to sign in with email."
            : "Someone, probably you, tried to create an account with this email. Sign in with your password. If you forgot it, reset it below.",
          url: `${baseURL}/forgot-password?email=${encodeURIComponent(user.email)}`,
          action: "Reset password",
        });
      },
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
          action: "Choose a new password",
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
      // An unverified sign-in gets a fresh link, so a lost or expired email
      // never locks anyone out.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({
        user,
        url,
      }: IdentityEmailContext) => sendVerificationLink(user, url),
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
        // People often sign up with a password, miss the verification email,
        // then try Google. Refusing that link ("account_not_linked") left them
        // unable to sign in at all. The account hook below makes it safe.
        requireLocalEmailVerified: false,
      },
    },
    advanced: {
      cookiePrefix: `commons-identity-${AUTH_SESSION_VERSION}`,
      // Rate limits key on this address. src/index.ts sets it on every
      // request before Better Auth sees it (see lib/client-ip.ts).
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
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
      account: {
        create: {
          // Google is linking to an account whose email was never verified.
          // Its password proves nothing about who owns the address, and
          // whoever set it could be someone else, so Google must prove the
          // address and the unverified password is removed.
          before: async (account: {
            userId: string;
            providerId: string;
            idToken?: string | null;
          }) => {
            if (account.providerId === "credential") return;
            const owner = await db.query(
              `select email, "emailVerified" from "user" where id = $1`,
              [account.userId],
            );
            const user = owner.rows[0] as
              | { email: string; emailVerified: boolean }
              | undefined;
            if (!user || user.emailVerified) return;
            const password = await db.query(
              `select id from account where "userId" = $1 and "providerId" = 'credential'`,
              [account.userId],
            );
            if (password.rows.length === 0) return;
            let claims: { email?: unknown; email_verified?: unknown } = {};
            try {
              claims = account.idToken ? decodeJwt(account.idToken) : {};
            } catch {}
            if (
              claims.email_verified !== true ||
              String(claims.email ?? "").toLowerCase() !== user.email.toLowerCase()
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Google did not verify this email address.",
              });
            }
            await db.query(
              `delete from account where "userId" = $1 and "providerId" = 'credential'`,
              [account.userId],
            );
            await db.query(`delete from session where "userId" = $1`, [
              account.userId,
            ]);
          },
        },
      },
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
            // First-party Commons sessions represent the user's account, so
            // their short-lived platform JWT must carry the same capabilities
            // exposed to the CLI and web app. Project API keys and third-party
            // OAuth clients remain restricted to their explicitly granted
            // scopes.
            scopes: [...PLATFORM_SCOPES],
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
          ...PLATFORM_SCOPES,
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
          new Set([
            process.env.COMMONS_CLI_CLIENT_ID ?? "commons-cli",
            process.env.COMMONS_DESKTOP_CLIENT_ID ?? "commons-desktop",
          ]).has(clientId),
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
  action?: string;
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
          : `<h1>${input.heading}</h1><p>${input.body}</p><p><a href="${input.url}">${input.action ?? "Continue"}</a></p>`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Identity email failed with status ${response.status}`);
  }
}
