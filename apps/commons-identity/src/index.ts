import { serve } from "@hono/node-server";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "../lib/auth.js";
import { appEmailBrand, sendIdentityEmail } from "../lib/auth-config.js";
import { pool } from "../lib/db.js";
import { createCommonsId } from "../lib/ids.js";
import { escapeHtml, page, safeReturnPath } from "./ui.js";
import { createPlatformRouter } from "./platform.js";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3010";
const nativeApps = {
  commonlabs: {
    name: "CommonLab",
    defaultReturnTo: "https://commonlab.agentcommons.io/auth/signin",
  },
  "agent-commons": {
    name: "Agent Commons",
    defaultReturnTo: "https://www.agentcommons.io/login",
  },
  "common-os": {
    name: "CommonOS",
    defaultReturnTo: "https://os.agentcommons.io/auth",
  },
} as const;

type NativeApp = keyof typeof nativeApps;

function nativeApp(value: string | undefined): NativeApp {
  return value && value in nativeApps ? (value as NativeApp) : "agent-commons";
}

function safeExternalReturnTo(value: string | undefined, app: NativeApp) {
  if (!value) return nativeApps[app].defaultReturnTo;
  try {
    const url = new URL(value);
    const allowed = (process.env.COMMONS_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (allowed.includes(url.origin)) return url.toString();
  } catch {}
  return nativeApps[app].defaultReturnTo;
}

function validOAuthQuery(value: string | undefined) {
  if (!value) return "";
  try {
    const query = new URLSearchParams(value);
    return query.has("client_id") &&
      query.has("redirect_uri") &&
      query.has("state") &&
      query.has("sig")
      ? value
      : "";
  } catch {
    return "";
  }
}

async function nativeAuthResponse(
  authService: typeof auth,
  input: {
    endpoint: "/api/auth/sign-in/email" | "/api/auth/sign-up/email" | "/api/auth/sign-in/social";
    body: Record<string, unknown>;
    request: Request;
    returnTo: string;
  },
) {
  const request = new Request(new URL(input.endpoint, baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: input.request.headers.get("cookie") ?? "",
      origin: new URL(baseUrl).origin,
    },
    body: JSON.stringify(input.body),
  });
  const response = await authService.handler(request);
  const data = (await response.clone().json().catch(() => ({}))) as {
    url?: string;
    redirect?: string;
    message?: string;
    error?: string;
  };
  const location = data.url ?? data.redirect;
  const target = response.ok
    ? location ?? input.returnTo
    : `${input.returnTo}${input.returnTo.includes("?") ? "&" : "?"}authError=${encodeURIComponent(
        data.message ?? data.error ?? "Authentication failed",
      )}`;
  const headers = new Headers({ location: target });
  const responseHeaders = response.headers as Headers &
    Partial<{ getSetCookie(): string[] }>;
  const setCookies =
    typeof responseHeaders.getSetCookie === "function"
      ? responseHeaders.getSetCookie()
      : [responseHeaders.get("set-cookie")].filter(
          (value): value is string => Boolean(value),
        );
  setCookies.forEach((cookie) => headers.append("set-cookie", cookie));
  return new Response(null, { status: 302, headers });
}

export function createIdentityApp(
  authService: typeof auth = auth,
  database: typeof pool = pool,
) {
const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      const allowed = (process.env.COMMONS_TRUSTED_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim());
      return allowed.includes(origin) ? origin : baseUrl;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", service: "commons-identity", time: new Date().toISOString() }),
);

app.get("/api/auth/native/sign-in/google", handleNativeGoogleSignIn);
app.post("/api/auth/native/sign-in/email", handleNativeEmailSignIn);
app.on(["GET", "POST"], "/api/auth/*", (c) => authService.handler(c.req.raw));
app.on(["GET", "POST"], "/.well-known/*", (c) => authService.handler(c.req.raw));
app.route("/api/platform", createPlatformRouter(authService, database));

app.get("/", (c) =>
  c.html(
    page(
      "Commons Identity",
      `<h1>Commons Identity</h1>
       <p>One account for Commons Courses, Agent Commons, Common OS, CLI, SDKs, and future Commons applications.</p>
       <div class="row"><a class="button" href="/sign-in">Sign in</a>
       <a class="button secondary" href="/platform">API platform</a></div>`,
    ),
  ),
);

app.get("/platform", async (c) => {
  const session = await authService.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.redirect("/sign-in?redirect=%2Fplatform");
  }
  const memberships = await database.query(
    `select m.workspace_id as "workspaceId", w.name
       from commons_workspace_membership m
       join commons_workspace w on w.id = m.workspace_id
      where m.user_id = $1 and m.status = 'active'
      order by m.created_at asc`,
    [session.user.id],
  );
  return c.html(
    page(
      "Commons API Platform",
      `<h1>Commons API Platform</h1>
       <p>Projects isolate credentials, usage, limits, and environments across Agent Commons and Common OS.</p>
       <form id="project-form">
         <label>Project name<input id="project-name" required value="My project"></label>
         <label>Workspace<select id="workspace">${memberships.rows
           .map(
             (membership) =>
               `<option value="${escapeHtml(String(membership.workspaceId))}">${escapeHtml(String(membership.name))}</option>`,
           )
           .join("")}</select></label>
         <label>Environment<select id="environment"><option value="production">Production</option><option value="development">Development</option><option value="staging">Staging</option></select></label>
         <button>Create project</button>
       </form>
       <h2>Projects</h2><div id="projects"></div>
       <p id="message" role="alert"></p>`,
      `
      const projects = document.querySelector("#projects");
      const message = document.querySelector("#message");
      async function request(path, options) {
        const response = await fetch(path, {
          credentials:"include",
          headers:{"Content-Type":"application/json"},
          ...options
        });
        const data = response.status === 204 ? null : await response.json();
        if (!response.ok) throw new Error(data?.error || "Request failed");
        return data;
      }
      async function load() {
        const result = await request("/api/platform/projects");
        projects.innerHTML = result.data.length ? result.data.map(project => \`
          <section class="card">
            <h3>\${project.name}</h3>
            <p class="muted"><code>\${project.id}</code> · \${project.environment}</p>
            <button data-key-project="\${project.id}" class="secondary">Create API key</button>
            <div id="keys-\${project.id}"></div>
          </section>\`).join("") : "<p>No projects yet.</p>";
        document.querySelectorAll("[data-key-project]").forEach(button => {
          button.onclick = () => createKey(button.dataset.keyProject);
        });
      }
      async function createKey(projectId) {
        const name = prompt("Key name", "Development key");
        if (!name) return;
        const result = await request(\`/api/platform/projects/\${projectId}/api-keys\`, {
          method:"POST", body:JSON.stringify({name})
        });
        const target = document.querySelector(\`#keys-\${projectId}\`);
        target.innerHTML = \`<p class="success">Copy this key now. It will not be shown again.</p><code style="word-break:break-all">\${result.data.key}</code>\`;
      }
      document.querySelector("#project-form").onsubmit = async event => {
        event.preventDefault(); message.textContent="";
        try {
          await request("/api/platform/projects", {
            method:"POST",
            body:JSON.stringify({
              name:document.querySelector("#project-name").value,
              workspaceId:document.querySelector("#workspace").value,
              environment:document.querySelector("#environment").value
            })
          });
          await load();
        } catch (error) { message.className="error"; message.textContent=error.message; }
      };
      load().catch(error => { message.className="error"; message.textContent=error.message; });`,
    ),
  );
});

app.get("/sign-in", (c) => {
  const redirect = safeReturnPath(c.req.query("redirect") ?? null, "/");
  const oauthQuery = new URL(c.req.url).search.slice(1);
  return c.html(
    page(
      "Sign in",
      `<h1>Sign in to Commons</h1>
       <p>Continue across every Commons application with one identity.</p>
       <form id="email-form">
         <label>Email<input id="email" type="email" autocomplete="email" required></label>
         <label>Password<input id="password" type="password" autocomplete="current-password" required></label>
         <button type="submit">Sign in</button>
       </form>
       <p class="muted">New to Commons? <a href="/sign-up">Create an account</a></p>
       <div class="divider">or</div>
       <button class="secondary google-button" id="google">
         <svg class="google-logo" viewBox="0 0 18 18" aria-hidden="true">
           <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.614Z"/>
           <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z"/>
           <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.826.956 4.039l3.007-2.333Z"/>
           <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.333C4.672 5.165 6.656 3.58 9 3.58Z"/>
         </svg>
         Continue with Google
       </button>
       <p id="message" class="error" role="alert"></p>`,
      `
      const redirect = ${JSON.stringify(redirect)};
      const oauthQuery = ${JSON.stringify(oauthQuery)};
      const message = document.querySelector("#message");
      async function post(path, body) {
        const response = await fetch(path, {
          method: "POST", credentials: "include",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || data.error || "Sign in failed");
        return data;
      }
      document.querySelector("#email-form").addEventListener("submit", async (event) => {
        event.preventDefault(); message.textContent = "";
        try {
          const data = await post("/api/auth/sign-in/email", {
            email: document.querySelector("#email").value,
            password: document.querySelector("#password").value,
            callbackURL: redirect,
            ...(oauthQuery ? { oauth_query: oauthQuery } : {})
          });
          location.href = data.url || data.redirect || redirect;
        } catch (error) { message.textContent = error.message; }
      });
      document.querySelector("#google").addEventListener("click", async () => {
        try {
          const data = await post("/api/auth/sign-in/social", {
            provider: "google", callbackURL: redirect,
            ...(oauthQuery ? { oauth_query: oauthQuery } : {})
          });
          location.href = data.url;
        } catch (error) { message.textContent = error.message; }
      });`,
    ),
  );
});

async function handleNativeGoogleSignIn(c: any) {
  const appId = nativeApp(c.req.query("app"));
  const returnTo = safeExternalReturnTo(c.req.query("return_to"), appId);
  const oauthQuery = validOAuthQuery(c.req.query("oauth_query"));
  if (!oauthQuery) return c.redirect(`${returnTo}?authError=Invalid+sign-in+request`);
  return nativeAuthResponse(authService, {
    endpoint: "/api/auth/sign-in/social",
    request: c.req.raw,
    returnTo,
    body: {
      provider: "google",
      callbackURL: returnTo,
      oauth_query: oauthQuery,
    },
  });
}

app.get("/native/sign-in/google", handleNativeGoogleSignIn);

async function handleNativeEmailSignIn(c: any) {
  const form = await c.req.parseBody();
  const appId = nativeApp(String(form.app ?? ""));
  const returnTo = safeExternalReturnTo(String(form.return_to ?? ""), appId);
  const oauthQuery = validOAuthQuery(String(form.oauth_query ?? ""));
  if (!oauthQuery) return c.redirect(`${returnTo}?authError=Invalid+sign-in+request`);
  return nativeAuthResponse(authService, {
    endpoint: "/api/auth/sign-in/email",
    request: c.req.raw,
    returnTo,
    body: {
      email: String(form.email ?? ""),
      password: String(form.password ?? ""),
      callbackURL: returnTo,
      oauth_query: oauthQuery,
    },
  });
}

app.post("/native/sign-in/email", handleNativeEmailSignIn);

app.post("/native/sign-up/email", async (c) => {
  const form = await c.req.parseBody();
  const appId = nativeApp(String(form.app ?? ""));
  const returnToUrl = new URL(
    safeExternalReturnTo(String(form.return_to ?? ""), appId),
  );
  returnToUrl.searchParams.set("registered", "1");
  returnToUrl.searchParams.set("commons_app", appId);
  const returnTo = returnToUrl.toString();
  const oauthQuery = validOAuthQuery(String(form.oauth_query ?? ""));
  if (!oauthQuery) return c.redirect(`${returnTo}?authError=Invalid+sign-up+request`);
  return nativeAuthResponse(authService, {
    endpoint: "/api/auth/sign-up/email",
    request: c.req.raw,
    returnTo,
    body: {
      name: String(form.name ?? ""),
      email: String(form.email ?? ""),
      password: String(form.password ?? ""),
      callbackURL: returnTo,
      oauth_query: oauthQuery,
    },
  });
});

app.get("/sign-up", (c) => {
  const redirect = safeReturnPath(c.req.query("redirect") ?? null, "/");
  const oauthQuery = new URL(c.req.url).search.slice(1);
  return c.html(
    page(
      "Create account",
      `<h1>Create your Commons account</h1>
       <p>This account works across every Commons application.</p>
       <form id="signup-form">
         <label>Name<input id="name" autocomplete="name" required></label>
         <label>Email<input id="email" type="email" autocomplete="email" required></label>
         <label>Password<input id="password" type="password" minlength="8" autocomplete="new-password" required></label>
         <button type="submit">Create account</button>
       </form>
       <p class="muted">Already registered? <a href="/sign-in">Sign in</a></p>
       <p id="message" role="alert"></p>`,
      `
      const redirect = ${JSON.stringify(redirect)};
      const oauthQuery = ${JSON.stringify(oauthQuery)};
      document.querySelector("#signup-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.querySelector("#message");
        message.textContent = "";
        const response = await fetch("/api/auth/sign-up/email", {
          method:"POST", credentials:"include",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            name:document.querySelector("#name").value,
            email:document.querySelector("#email").value,
            password:document.querySelector("#password").value,
            callbackURL:redirect,
            ...(oauthQuery ? {oauth_query:oauthQuery} : {})
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          message.className="error";
          message.textContent=data.message||data.error||"Could not create account";
          return;
        }
        message.className="success";
        message.textContent="Check your email to verify your Commons account.";
      });`,
    ),
  );
});

app.get("/consent", (c) => {
  const oauthQuery = new URL(c.req.url).search.slice(1);
  return c.html(
    page(
      "Authorize application",
      `<h1>Authorize Commons application</h1>
       <p>This application is requesting permission to access your Commons profile and act within the scopes shown during authorization.</p>
       <div class="row"><button id="approve">Allow</button><button class="danger" id="deny">Deny</button></div>
       <p id="message" class="error"></p>`,
      `
      const oauthQuery = ${JSON.stringify(oauthQuery)};
      async function decide(accept) {
        const response = await fetch("/api/auth/oauth2/consent", {
          method: "POST", credentials: "include",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ accept, oauth_query: oauthQuery })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          document.querySelector("#message").textContent = data.message || data.error || "Authorization failed";
          return;
        }
        location.href = data.redirect_uri || data.url;
      }
      document.querySelector("#approve").onclick = () => decide(true);
      document.querySelector("#deny").onclick = () => decide(false);`,
    ),
  );
});

app.get("/device", (c) => {
  const initialCode = c.req.query("user_code") ?? "";
  return c.html(
    page(
      "Connect a device",
      `<h1>Connect Commons CLI</h1><p>Enter the code displayed in your terminal.</p>
       <form id="device-form"><label>Device code<input id="code" value="${escapeHtml(initialCode)}" autocomplete="one-time-code" required></label>
       <button>Continue</button></form><p id="message" class="error"></p>`,
      `
      document.querySelector("#device-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const code = document.querySelector("#code").value.replaceAll("-", "").trim().toUpperCase();
        const response = await fetch("/api/auth/device?user_code=" + encodeURIComponent(code), {credentials:"include"});
        if (response.status === 401) {
          location.href = "/sign-in?redirect=" + encodeURIComponent("/device?user_code=" + code);
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          document.querySelector("#message").textContent = data.error_description || data.message || "Invalid code";
          return;
        }
        location.href = "/device/approve?user_code=" + encodeURIComponent(code);
      });`,
    ),
  );
});

app.get("/device/approve", async (c) => {
  const code = c.req.query("user_code") ?? "";
  const session = await authService.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.redirect(
      `/sign-in?redirect=${encodeURIComponent(`/device/approve?user_code=${code}`)}`,
    );
  }
  return c.html(
    page(
      "Approve device",
      `<h1>Authorize Commons CLI</h1><p>Signed in as ${escapeHtml(session.user.email)}.</p>
       <p>Code: <code>${escapeHtml(code)}</code></p>
       <div class="row"><button id="approve">Approve</button><button class="danger" id="deny">Deny</button></div>
       <p id="message"></p>`,
      `
      const code = ${JSON.stringify(code)};
      async function decide(action) {
        const response = await fetch("/api/auth/device/" + action, {
          method:"POST", credentials:"include", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({userCode:code})
        });
        const data = await response.json().catch(() => ({}));
        const message = document.querySelector("#message");
        if (!response.ok) { message.className="error"; message.textContent=data.message||data.error||"Request failed"; return; }
        message.className="success";
        message.textContent=action==="approve" ? "Device approved. Return to your terminal." : "Device request denied.";
      }
      document.querySelector("#approve").onclick=()=>decide("approve");
      document.querySelector("#deny").onclick=()=>decide("deny");`,
    ),
  );
});

app.get("/api/identity/me", async (c) => {
  const session = await authService.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const memberships = await database.query(
    `select m.workspace_id as "workspaceId", m.role, w.name
       from commons_workspace_membership m
       join commons_workspace w on w.id = m.workspace_id
      where m.user_id = $1 and m.status = 'active'
      order by m.created_at asc`,
    [session.user.id],
  );
  return c.json({ user: session.user, workspaces: memberships.rows });
});

app.post("/api/identity/apps/:app/activate", async (c) => {
  const bearerToken = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const session = await authService.api.getSession({ headers: c.req.raw.headers });
  const tokenUser = bearerToken
    ? await database.query(
        `select u.id, u.email
           from "oauthAccessToken" t
           join "user" u on u.id = t."userId"
          where t.token = $1 and t."expiresAt" > now()
          limit 1`,
        [createHash("sha256").update(bearerToken).digest("base64url")],
      )
    : { rows: [] };
  const user = session?.user ?? tokenUser.rows[0];
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const appId = nativeApp(c.req.param("app"));
  const membershipId = createCommonsId("membership");
  const activated = await database.query(
    `insert into commons_app_membership (id, user_id, app_id)
     values ($1, $2, $3)
     on conflict (user_id, app_id)
     do update set last_seen_at = now()
     returning (xmax = 0) as created`,
    [membershipId, user.id, appId],
  );
  const created = Boolean(activated.rows[0]?.created);
  if (created) {
    const brand = appEmailBrand(appId);
    await sendIdentityEmail({
      to: String(user.email),
      from: brand.from,
      subject: `Welcome to ${brand.product}`,
      heading: `Welcome to ${brand.product}`,
      body:
        appId === "commonlabs"
          ? "Your learning account is ready. Pick up a course whenever you are ready."
          : appId === "common-os"
            ? "Your compute account is ready. Your fleets and imported agents stay attached to this identity."
            : "Your agent workspace is ready. Your existing agents and sessions stay attached to this identity.",
      url:
        appId === "commonlabs"
          ? "https://commonlab.agentcommons.io/dashboard"
          : appId === "common-os"
            ? "https://os.agentcommons.io/dashboard"
            : "https://www.agentcommons.io/agents",
      template: appId === "commonlabs" ? "commonlab" : "default",
    });
  }
  const identity = await database.query(
    `select id, "defaultWorkspaceId" as "workspaceId", image
       from "user" where id = $1`,
    [user.id],
  );
  return c.json({
    activated: true,
    firstActivation: created,
    userId: identity.rows[0]?.id ?? user.id,
    workspaceId: identity.rows[0]?.workspaceId ?? null,
    image: identity.rows[0]?.image ?? null,
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
return app;
}

const port = Number(process.env.PORT ?? 3010);
const app = createIdentityApp();
if (process.env.COMMONS_IDENTITY_NO_LISTEN !== "true") {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Commons Identity listening on ${baseUrl} (port ${port})`);
  });
}

export default app;
