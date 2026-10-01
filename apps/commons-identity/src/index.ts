import { serve } from "@hono/node-server";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { createLocalJWKSet, jwtVerify } from "jose";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "../lib/auth.js";
import { appEmailBrand, sendIdentityEmail } from "../lib/auth-config.js";
import { pool } from "../lib/db.js";
import { createCommonsId } from "../lib/ids.js";
import { clientName, escapeHtml, page, safeReturnPath, scopeList } from "./ui.js";
import { createPlatformRouter } from "./platform.js";

async function profileUserId(authService: typeof auth, database: typeof pool, headers: Headers): Promise<string | null> {
  const session = await authService.api.getSession({ headers }).catch(() => null);
  if (session?.user?.id) return session.user.id;
  const bearer = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;
  if (bearer.split(".").length === 3) {
    try {
      const { payload } = await jwtVerify(bearer, createLocalJWKSet(await authService.api.getJwks()), {
        issuer: process.env.COMMONS_IDENTITY_ISSUER ?? `${baseUrl}/api/auth`,
        audience: "commons-platform",
        requiredClaims: ["exp", "iat", "sub"],
      });
      return payload.actor_type === "user" && typeof payload.sub === "string" ? payload.sub : null;
    } catch { return null; }
  }
  const token = await database.query(
    `select "userId" from "oauthAccessToken" where token = $1 and "expiresAt" > now() limit 1`,
    [createHash("sha256").update(bearer).digest("base64url")],
  );
  return token.rows[0]?.userId ?? null;
}

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3010";
// Per-app return-to/dashboard URLs default to the production domains but can be
// overridden per environment (e.g. staging) via env vars.
const nativeApps = {
  commonlabs: {
    name: "CommonLab",
    defaultReturnTo:
      process.env.RETURN_TO_COMMONLABS ??
      "https://commonlab.agentcommons.io/auth/signin",
  },
  "agent-commons": {
    name: "Agent Commons",
    defaultReturnTo:
      process.env.RETURN_TO_AGENT_COMMONS ??
      "https://www.agentcommons.io/login",
  },
  "common-os": {
    name: "CommonOS",
    defaultReturnTo:
      process.env.RETURN_TO_COMMON_OS ?? "https://os.agentcommons.io/auth",
  },
  "common-business": {
    name: "Common Business",
    defaultReturnTo:
      process.env.RETURN_TO_COMMON_BUSINESS ??
      "https://common-business.vercel.app/sign-in",
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
      `<h1>Your Commons account</h1>
       <p>One account for Agent Commons, CommonLab, the desktop app, the CLI, and the SDKs.</p>
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
      `<h1>Sign in</h1>
       <p>Use your Commons account. It works across every Commons app.</p>
       <button class="secondary google-button" id="google">
         <svg class="google-logo" viewBox="0 0 18 18" aria-hidden="true">
           <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.614Z"/>
           <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z"/>
           <path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.826.956 4.039l3.007-2.333Z"/>
           <path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.333C4.672 5.165 6.656 3.58 9 3.58Z"/>
         </svg>
         Continue with Google
       </button>
       <div class="divider">or with email</div>
       <form id="email-form" style="margin-top:0">
         <label>Email<input id="email" type="email" autocomplete="email" required></label>
         <label>Password<input id="password" type="password" autocomplete="current-password" required></label>
         <button type="submit">Sign in</button>
       </form>
       <p id="message" class="error" role="alert"></p>
       <p class="footnote">New to Commons? <a href="/sign-up${oauthQuery ? `?${escapeHtml(oauthQuery)}` : ""}">Create an account</a></p>`,
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
      `<h1>Create your account</h1>
       <p>One Commons account for every Commons app.</p>
       <form id="signup-form">
         <label>Name<input id="name" autocomplete="name" required></label>
         <label>Email<input id="email" type="email" autocomplete="email" required></label>
         <label>Password<input id="password" type="password" minlength="8" autocomplete="new-password" required></label>
         <button type="submit">Create account</button>
       </form>
       <p id="message" role="alert"></p>
       <p class="footnote">Already have an account? <a href="/sign-in${oauthQuery ? `?${escapeHtml(oauthQuery)}` : ""}">Sign in</a></p>`,
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
        document.querySelector("main").innerHTML = '<div class="done">✓</div><h1>Check your email</h1><p>We sent a link to verify your account. Open it on this device to continue.</p>';
      });`,
    ),
  );
});

app.get("/consent", async (c) => {
  const oauthQuery = new URL(c.req.url).search.slice(1);
  const session = await authService.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const appName = clientName(c.req.query("client_id"));
  const email = session?.user?.email ?? "";
  return c.html(
    page(
      "Allow access",
      `<h1>${escapeHtml(appName)} wants to use your account</h1>
       <p>Allowing this lets it:</p>
       ${scopeList(c.req.query("scope"))}
       ${email ? `<div class="account"><span class="avatar">${escapeHtml(email.slice(0, 1).toUpperCase())}</span><span>${escapeHtml(email)}</span></div>` : ""}
       <div class="row"><button class="secondary" id="deny">Cancel</button><button id="approve">Allow</button></div>
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
      `<h1>Connect a device</h1><p>Enter the code shown in the desktop app or the CLI.</p>
       <form id="device-form"><label>Code<input id="code" class="code-input" value="${escapeHtml(initialCode)}" autocomplete="one-time-code" spellcheck="false" required></label>
       <button>Continue</button></form><p id="message" class="error"></p>`,
      `
      async function claimDevice(code) {
        code = code.replaceAll("-", "").trim().toUpperCase();
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
      }
      document.querySelector("#device-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        await claimDevice(document.querySelector("#code").value);
      });
      const initialCode = document.querySelector("#code").value;
      if (initialCode) void claimDevice(initialCode);`,
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
      `<h1>Connect this device?</h1>
       <p>Check that this code matches the one on your device.</p>
       <span class="code">${escapeHtml(code)}</span>
       <div class="account"><span class="avatar">${escapeHtml(session.user.email.slice(0, 1).toUpperCase())}</span><span>${escapeHtml(session.user.email)}</span></div>
       <div class="row"><button class="secondary" id="deny">Deny</button><button id="approve">Connect</button></div>
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
        document.querySelector("main").innerHTML = action==="approve"
          ? '<div class="done">✓</div><h1>You are connected</h1><p>Return to Agent Commons. It finishes signing in on its own.</p>'
          : '<h1>Request denied</h1><p>The device was not connected. You can close this page.</p>';
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

app.get("/api/identity/me/profile", async (c) => {
  const userId = await profileUserId(authService, database, c.req.raw.headers);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const result = await database.query(
    `select coalesce(p.display_name, u.name) as name,
            coalesce(p.image_url, u.image) as image,
            u.image as "providerImage", p.image_url is not null as "hasCustomImage"
       from "user" u left join commons_user_profile_override p on p.user_id = u.id
      where u.id = $1 limit 1`,
    [userId],
  );
  if (!result.rows[0]) return c.json({ error: "User not found" }, 404);
  return c.json({ data: result.rows[0] });
});

app.patch("/api/identity/me/profile", async (c) => {
  const userId = await profileUserId(authService, database, c.req.raw.headers);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({})) as { name?: string | null; imageUrl?: string | null };
  if (!Object.prototype.hasOwnProperty.call(body, "name") && !Object.prototype.hasOwnProperty.call(body, "imageUrl")) return c.json({ error: "Nothing to update" }, 400);
  let name: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    name = body.name === null ? null : typeof body.name === "string" ? body.name.trim() : undefined;
    if (name === undefined || (name !== null && (!name || name.length > 100))) return c.json({ error: "Name must be 1 to 100 characters" }, 400);
  }
  let imageUrl: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
    imageUrl = body.imageUrl === null ? null : typeof body.imageUrl === "string" ? body.imageUrl : undefined;
    if (imageUrl === undefined || imageUrl === "") return c.json({ error: "Invalid profile image" }, 400);
    if (imageUrl) {
      const gateway = (process.env.GATEWAY_URL ?? "gateway.pinata.cloud").replace(/^https?:\/\//, "").replace(/\/$/, "");
      let url: URL;
      try { url = new URL(imageUrl); } catch { return c.json({ error: "Invalid profile image" }, 400); }
      if (url.protocol !== "https:" || url.host !== gateway || !/^\/ipfs\/[a-zA-Z0-9]+$/.test(url.pathname) || url.search || url.hash) return c.json({ error: "Choose an uploaded profile image" }, 400);
    }
  }
  await database.query(
    `insert into commons_user_profile_override (user_id, display_name, image_url)
     values ($1, $2, $3)
     on conflict (user_id) do update set
       display_name = case when $4 then excluded.display_name else commons_user_profile_override.display_name end,
       image_url = case when $5 then excluded.image_url else commons_user_profile_override.image_url end,
       updated_at = now()`,
    [userId, name ?? null, imageUrl ?? null, name !== undefined, imageUrl !== undefined],
  );
  const result = await database.query(
    `select coalesce(p.display_name, u.name) as name,
            coalesce(p.image_url, u.image) as image,
            u.image as "providerImage", p.image_url is not null as "hasCustomImage"
       from "user" u left join commons_user_profile_override p on p.user_id = u.id
      where u.id = $1 limit 1`,
    [userId],
  );
  return c.json({ data: result.rows[0] });
});

/**
 * Service-to-service email → user id lookup, used by product apps (e.g.
 * Agent Commons credit gifting) to address a user by email. Requires a valid
 * client-credentials bearer token — user tokens are rejected so signed-in
 * browsers cannot probe the directory.
 */
app.get("/api/identity/users/resolve", async (c) => {
  const bearerToken = (c.req.header("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!bearerToken) return c.json({ error: "Unauthorized" }, 401);
  // Client-credentials tokens with a resource audience are signed JWTs and
  // are not stored in oauthAccessToken. Verify them against our signing keys.
  let clientId: string | undefined;
  if (bearerToken.split(".").length === 3) {
    try {
      const { payload } = await jwtVerify(
        bearerToken,
        createLocalJWKSet(await authService.api.getJwks()),
        {
          issuer:
            process.env.COMMONS_IDENTITY_ISSUER ?? `${baseUrl}/api/auth`,
          audience: "commons-platform",
          requiredClaims: ["exp", "iat", "azp"],
        },
      );
      if (
        payload.actor_type === "service" &&
        typeof payload.azp === "string"
      ) {
        clientId = payload.azp;
      }
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  } else {
    const tokenRow = await database.query(
      `select t."clientId", t."userId"
       from "oauthAccessToken" t
      where t.token = $1 and t."expiresAt" > now()
      limit 1`,
      [createHash("sha256").update(bearerToken).digest("base64url")],
    );
    if (tokenRow.rows[0] && !tokenRow.rows[0].userId) {
      clientId = tokenRow.rows[0].clientId;
    }
  }
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);
  const client = await database.query(
    `select "clientId" from "oauthClient"
    where "clientId" = $1 and (disabled is null or disabled = false)
    limit 1`,
    [clientId],
  );
  if (!client.rows.length) return c.json({ error: "Unauthorized" }, 401);

  const email = (c.req.query("email") ?? "").trim().toLowerCase();
  const userId = (c.req.query("userId") ?? "").trim();
  if (Boolean(email) === Boolean(userId) || (email && !email.includes("@"))) {
    return c.json({ error: "Provide either a valid email or userId" }, 400);
  }
  const user = email
    ? await database.query(
        `select id from "user" where lower(email) = $1 limit 1`,
        [email],
      )
    : await database.query(`select id from "user" where id = $1 limit 1`, [
        userId,
      ]);
  if (!user.rows.length) return c.json({ error: "User not found" }, 404);
  return c.json({ data: { userId: user.rows[0].id } });
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
            : appId === "common-business"
              ? "Your business workspace is ready. Inventory, sales, files, apps, and agents stay attached to this identity."
            : "Your agent workspace is ready. Your existing agents and sessions stay attached to this identity.",
      url:
        appId === "commonlabs"
          ? (process.env.DASHBOARD_URL_COMMONLABS ??
            "https://commonlab.agentcommons.io/dashboard")
          : appId === "common-os"
            ? (process.env.DASHBOARD_URL_COMMON_OS ??
              "https://os.agentcommons.io/dashboard")
            : appId === "common-business"
              ? (process.env.DASHBOARD_URL_COMMON_BUSINESS ??
                "https://common-business.vercel.app/dashboard")
            : (process.env.DASHBOARD_URL_AGENT_COMMONS ??
              "https://www.agentcommons.io/studio/agents"),
      template: appId === "commonlabs" ? "commonlab" : "default",
    });
  }
  const identity = await database.query(
    `select u.id, u."defaultWorkspaceId" as "workspaceId",
            coalesce(p.image_url, u.image) as image,
            coalesce(p.display_name, u.name) as name
       from "user" u left join commons_user_profile_override p on p.user_id = u.id
      where u.id = $1`,
    [user.id],
  );
  return c.json({
    activated: true,
    firstActivation: created,
    userId: identity.rows[0]?.id ?? user.id,
    workspaceId: identity.rows[0]?.workspaceId ?? null,
    image: identity.rows[0]?.image ?? null,
    name: identity.rows[0]?.name ?? null,
  });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
return app;
}

const port = Number(process.env.PORT ?? 3010);
const app = createIdentityApp();
if (process.env.COMMONS_IDENTITY_NO_LISTEN !== "true") {
  // The platform deploy rolls the Identity container without a separate
  // migration task. Create this additive table before the new profile routes
  // accept traffic; the same SQL is also in the offline migration list.
  await pool.query(`create table if not exists commons_user_profile_override (
    user_id text primary key references "user"(id) on delete cascade,
    display_name text,
    image_url text,
    updated_at timestamptz not null default now()
  )`);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Commons Identity listening on ${baseUrl} (port ${port})`);
  });
}

export default app;
