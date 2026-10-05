// Sign-in and sign-up journeys a new person can take, end to end against an
// in-memory database: Google, email and password, and every mix of the two.
// Google's token endpoint and the email provider are replaced with fakes.
import { readFile } from "fs/promises";
import { resolve } from "path";
import { createHash } from "crypto";
import { betterAuth } from "better-auth";
import { DataType, newDb } from "pg-mem";

const IDENTITY = "http://identity.test";
const APP = "https://www.test";

process.env.COMMONS_IDENTITY_NO_LISTEN = "true";
process.env.BETTER_AUTH_URL = IDENTITY;
process.env.COMMONS_IDENTITY_ISSUER = `${IDENTITY}/api/auth`;
process.env.BETTER_AUTH_SECRET =
  "test-secret-that-is-deliberately-longer-than-thirty-two-characters";
process.env.COMMONS_TRUSTED_ORIGINS = APP;
process.env.RETURN_TO_AGENT_COMMONS = `${APP}/login`;
process.env.GOOGLE_CLIENT_ID = "google-client";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";
process.env.RESEND_API_KEY = "test-resend-key";

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
for (const migration of [
  "better-auth.sql",
  "001-commons-identity-domain.sql",
  "002-api-platform.sql",
  "005-profile-overrides.sql",
]) {
  await database.query(await readFile(resolve("migrations", migration), "utf8"));
}

// Fake Google and the email provider; everything else is never fetched.
type Sent = { to: string; subject: string; html: string };
const sent: Sent[] = [];
let googleProfile: Record<string, unknown> = {};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    const part = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    return Response.json({
      access_token: "google-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: `${part({ alg: "RS256" })}.${part(googleProfile)}.signature`,
    });
  }
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(String(init?.body));
    sent.push({ to: body.to[0], subject: body.subject, html: body.html });
    return Response.json({ id: "email" });
  }
  throw new Error(`Unexpected fetch in test: ${url}`);
}) as typeof fetch;

const { commonsAuthOptions } = await import("../lib/auth-config");
const { ensureOAuthClient } = await import("../lib/oauth-client-store");
const auth = betterAuth(commonsAuthOptions(database));
const { createIdentityApp } = await import("../src/index");
const app = createIdentityApp(auth as never, database as never);

const appClient = await ensureOAuthClient(database, {
  name: "E2E Agent Commons",
  redirectUris: [`${APP}/api/auth/callback/commons`],
  grantTypes: ["authorization_code", "refresh_token"],
  requirePkce: true,
  skipConsent: true,
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** A browser: keeps cookies per host and never follows redirects. */
function browser() {
  const jar = new Map<string, string>();
  return async function go(url: string, init: RequestInit = {}) {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const headers = new Headers(init.headers);
    if (cookie && url.startsWith(IDENTITY)) headers.set("cookie", cookie);
    // Top-level navigations, as a browser sends them.
    headers.set("sec-fetch-mode", "navigate");
    headers.set("accept", "text/html,application/xhtml+xml");
    const response = await app.request(url, { ...init, headers, redirect: "manual" });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (/max-age=0/i.test(setCookie) || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  };
}

function location(response: Response) {
  const value = response.headers.get("location");
  assert(value, `expected a redirect, got ${response.status}: ${value}`);
  return new URL(value, IDENTITY);
}

/** What www's /api/auth/native/start hands to its login page. */
async function appOAuthQuery() {
  const authorize = await app.request(
    `${IDENTITY}/api/auth/oauth2/authorize?${new URLSearchParams({
      client_id: appClient.client_id,
      redirect_uri: `${APP}/api/auth/callback/commons`,
      response_type: "code",
      scope: "openid email profile",
      state: "app-state",
      code_challenge: "0123456789012345678901234567890123456789012",
      code_challenge_method: "S256",
      resource: "commons-platform",
    })}`,
    { redirect: "manual" },
  );
  return location(authorize).search.slice(1);
}

const returnTo = `${APP}/login?callbackUrl=%2Fstudio`;

/** Starts "Continue with Google" on www and comes back from Google. */
async function googleFromApp(
  go: ReturnType<typeof browser>,
  profile: Record<string, unknown>,
  googleError?: string,
) {
  googleProfile = profile;
  const start = await go(
    `${IDENTITY}/native/sign-in/google?${new URLSearchParams({
      app: "agent-commons",
      oauth_query: await appOAuthQuery(),
      return_to: returnTo,
    })}`,
  );
  const google = location(start);
  assert(google.hostname === "accounts.google.com", `Google sign-in did not start: ${google}`);
  const state = google.searchParams.get("state")!;
  return go(
    `${IDENTITY}/api/auth/callback/google?${new URLSearchParams(
      googleError ? { error: googleError, state } : { code: "google-code", state },
    )}`,
  );
}

/** Follows identity redirects until the browser leaves identity. */
async function followToApp(go: ReturnType<typeof browser>, response: Response) {
  let current = response;
  for (let hop = 0; hop < 5; hop++) {
    const next = location(current);
    if (next.origin !== IDENTITY) return next;
    current = await go(next.toString());
  }
  throw new Error("too many redirects inside identity");
}

async function userRow(email: string) {
  const user = await database.query(
    `select id, "emailVerified" from "user" where email = $1`,
    [email],
  );
  return user.rows[0] as { id: string; emailVerified: boolean } | undefined;
}

async function providers(email: string) {
  const rows = await database.query(
    `select a."providerId" from account a join "user" u on u.id = a."userId"
     where u.email = $1 order by a."providerId"`,
    [email],
  );
  return rows.rows.map((row: { providerId: string }) => row.providerId);
}

async function emailSignUp(email: string, password = "first-password-123") {
  const response = await app.request(`${IDENTITY}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Person", email, password }),
  });
  assert(response.ok, `email sign-up failed: ${response.status} ${await response.text()}`);
}

async function emailSignIn(email: string, password: string) {
  return app.request(`${IDENTITY}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function sentTo(email: string) {
  return sent.filter((message) => message.to === email);
}

function linkIn(message: Sent) {
  const url = message.html.match(/href="([^"]+)"/)?.[1];
  assert(url, `no link in "${message.subject}"`);
  return url.replaceAll("&amp;", "&");
}

const results: Record<string, true> = {};
async function journey(name: string, run: () => Promise<void>) {
  try {
    await run();
    results[name] = true;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.log(`not ok - ${name}\n  ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

await journey("new person signs up with Google from the app", async () => {
  const go = browser();
  const back = await googleFromApp(go, {
    sub: "google-new", email: "new@example.com", email_verified: true, name: "New Person",
  });
  const landed = await followToApp(go, back);
  assert(
    landed.pathname === "/api/auth/callback/commons" && landed.searchParams.has("code"),
    `did not return to the app with a code: ${landed}`,
  );
  assert((await userRow("new@example.com"))?.emailVerified, "Google user is not verified");
});

await journey("unverified password account, then Google from the app", async () => {
  await emailSignUp("unverified@example.com");
  const go = browser();
  const back = await googleFromApp(go, {
    sub: "google-unverified", email: "unverified@example.com", email_verified: true, name: "Test",
  });
  const landed = await followToApp(go, back);
  assert(
    landed.pathname === "/api/auth/callback/commons" && landed.searchParams.has("code"),
    `Google sign-in did not reach the app: ${landed}`,
  );
  assert((await userRow("unverified@example.com"))?.emailVerified, "email was not verified by Google");
  const linked = await providers("unverified@example.com");
  assert(
    linked.join(",") === "google",
    `the unverified password must be dropped when Google proves the address, got ${linked}`,
  );
});

await journey("an unverified password stops working once Google claims the address", async () => {
  // Someone else may have signed up with this address first.
  await emailSignUp("claimed@example.com", "someone-elses-password");
  const go = browser();
  await followToApp(go, await googleFromApp(go, {
    sub: "google-claimed", email: "claimed@example.com", email_verified: true,
  }));
  const signin = await emailSignIn("claimed@example.com", "someone-elses-password");
  assert(signin.status === 401, `the earlier password still signs in: ${signin.status}`);
});

await journey("Google cannot claim an address it has not verified", async () => {
  await emailSignUp("google-unverified@example.com", "owner-password-123");
  const go = browser();
  const landed = await followToApp(go, await googleFromApp(go, {
    sub: "google-not-verified", email: "google-unverified@example.com", email_verified: false,
  }));
  assert(!landed.searchParams.has("code") && landed.searchParams.has("authError"),
    `an unverified Google address signed in: ${landed}`);
  const linked = await providers("google-unverified@example.com");
  assert(linked.join(",") === "credential", `account changed: ${linked}`);
});

await journey("verified password account, then Google keeps both", async () => {
  await emailSignUp("verified@example.com");
  await database.query(`update "user" set "emailVerified" = true where email = $1`, ["verified@example.com"]);
  const go = browser();
  const landed = await followToApp(go, await googleFromApp(go, {
    sub: "google-verified", email: "verified@example.com", email_verified: true,
  }));
  assert(landed.searchParams.has("code"), `Google sign-in did not reach the app: ${landed}`);
  const linked = await providers("verified@example.com");
  assert(linked.join(",") === "credential,google", `expected both sign-in methods, got ${linked}`);
});

await journey("Google failure returns to the app with a message", async () => {
  const go = browser();
  const landed = await followToApp(go, await googleFromApp(go, {}, "access_denied"));
  assert(landed.origin === APP && landed.pathname === "/login", `error did not return to the app: ${landed}`);
  const message = landed.searchParams.get("authError") ?? "";
  assert(/cancel|google/i.test(message), `unhelpful error message: "${message}"`);
});

await journey("hosted sign-in shows Google errors instead of looping", async () => {
  const page = await app.request(`${IDENTITY}/?error=account_not_linked`, { redirect: "manual" });
  const target = page.status === 302 ? location(page) : null;
  const html = target
    ? await (await app.request(target.toString())).text()
    : await page.text();
  assert(/already|different|Google|password/i.test(html) && /role="alert"[^>]*>[^<]+</.test(html),
    "the error is not shown to the person");
});

await journey("unverified email sign-in sends a new verification link", async () => {
  await emailSignUp("resend@example.com", "resend-password-123");
  const before = sentTo("resend@example.com").length;
  const response = await emailSignIn("resend@example.com", "resend-password-123");
  assert(response.status === 403, `expected 403, got ${response.status}`);
  assert(sentTo("resend@example.com").length === before + 1, "no new verification email was sent");
});

await journey("signing up again with a Google-only email explains how to sign in", async () => {
  const go = browser();
  await followToApp(go, await googleFromApp(go, {
    sub: "google-only", email: "google-only@example.com", email_verified: true,
  }));
  await emailSignUp("google-only@example.com", "another-password-123");
  const message = sentTo("google-only@example.com").at(-1);
  assert(message && /already/i.test(message.subject + message.html), "no email explained the existing account");
  assert(/Google/.test(message.html), "the email does not mention Google sign-in");
  assert(/reset/i.test(message.html), "the email does not offer a password reset");
});

await journey("Google-only account sets a password and signs in with email", async () => {
  const request = await app.request(`${IDENTITY}/api/auth/request-password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "google-only@example.com", redirectTo: "/reset-password" }),
  });
  assert(request.ok, `password reset request failed: ${request.status} ${await request.text()}`);
  const resetEmail = sentTo("google-only@example.com").at(-1)!;
  assert(/reset/i.test(resetEmail.subject), "no reset email was sent");
  const tokenRedirect = await app.request(linkIn(resetEmail), { redirect: "manual" });
  const resetPage = location(tokenRedirect);
  assert(resetPage.pathname === "/reset-password" && resetPage.searchParams.get("token"),
    `reset link did not open the reset page: ${resetPage}`);
  const pageHtml = await (await app.request(resetPage.toString())).text();
  assert(/new password/i.test(pageHtml), "the reset page has no new password form");
  const reset = await app.request(`${IDENTITY}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: resetPage.searchParams.get("token"), newPassword: "brand-new-password-1" }),
  });
  assert(reset.ok, `password reset failed: ${reset.status} ${await reset.text()}`);
  const signin = await emailSignIn("google-only@example.com", "brand-new-password-1");
  assert(signin.ok, `email sign-in after reset failed: ${signin.status}`);
});

await journey("sign-up from the app, verify, and land back in the app", async () => {
  const go = browser();
  const form = new URLSearchParams({
    app: "agent-commons", oauth_query: await appOAuthQuery(), return_to: returnTo,
    name: "App Person", email: "app-signup@example.com", password: "app-password-123",
  });
  const signedUp = location(await go(`${IDENTITY}/native/sign-up/email`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  }));
  assert(signedUp.origin === APP && signedUp.searchParams.get("registered") === "1",
    `sign-up did not return to the app with registered=1: ${signedUp}`);
  const verify = sentTo("app-signup@example.com").at(-1);
  assert(verify, "no verification email was sent");
  const afterVerify = location(await go(linkIn(verify)));
  assert(afterVerify.origin === APP && afterVerify.searchParams.get("verified") === "1",
    `verification did not return to the app as verified: ${afterVerify}`);
  assert((await userRow("app-signup@example.com"))?.emailVerified, "email is not verified");
});

await journey("wrong password from the app returns a readable error", async () => {
  const go = browser();
  const back = location(await go(`${IDENTITY}/native/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      app: "agent-commons", oauth_query: await appOAuthQuery(), return_to: returnTo,
      email: "verified@example.com", password: "not-the-password",
    }),
  }));
  assert(back.origin === APP && /password/i.test(back.searchParams.get("authError") ?? ""),
    `unexpected error return: ${back}`);
});

await journey("unverified sign-in from the app says a link was sent", async () => {
  const go = browser();
  const back = location(await go(`${IDENTITY}/native/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      app: "agent-commons", oauth_query: await appOAuthQuery(), return_to: returnTo,
      email: "resend@example.com", password: "resend-password-123",
    }),
  }));
  assert(/verif/i.test(back.searchParams.get("authError") ?? "") && /sent/i.test(back.searchParams.get("authError") ?? ""),
    `unverified sign-in message does not say a link was sent: ${back.searchParams.get("authError")}`);
  const callback = new URL(linkIn(sentTo("resend@example.com").at(-1)!)).searchParams.get("callbackURL") ?? "";
  assert(new URL(callback).searchParams.get("verified") === "1",
    `the new link does not sign the person in to the app: ${callback}`);
});

await journey("hosted sign-in for the CLI device page signs in", async () => {
  // /device and /platform send people to /sign-in?redirect=..., which is not an
  // OAuth request and must not be sent as one.
  const page = await (await app.request(`${IDENTITY}/sign-in?redirect=${encodeURIComponent("/device?user_code=ABCD")}`)).text();
  const oauthQuery = JSON.parse(page.match(/const oauthQuery = (".*?");/)?.[1] ?? '""');
  const response = await app.request(`${IDENTITY}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "verified@example.com", password: "first-password-123", callbackURL: "/device?user_code=ABCD",
      ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
    }),
  });
  assert(response.ok, `device sign-in failed: ${response.status} ${await response.text()}`);
});

/** Starts a sign-in the way the desktop app does. */
async function startDeviceSignIn() {
  const response = await app.request(`${IDENTITY}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "commons-desktop", scope: "openid profile email" }),
  });
  const device = (await response.json()) as { device_code: string; user_code: string };
  assert(response.ok && device.user_code, `device sign-in did not start: ${response.status}`);
  return device;
}

/** Opens the device link signed out, as a new person does, and returns where sign-in sends them back. */
async function openDeviceLinkSignedOut(go: ReturnType<typeof browser>, userCode: string) {
  // The /device page checks the code first, then moves on to approval.
  const check = await go(`${IDENTITY}/api/auth/device?user_code=${userCode}`);
  assert(check.ok, `the device page rejected a fresh code: ${check.status}`);
  const signIn = location(await go(`${IDENTITY}/device/approve?user_code=${userCode}`));
  assert(signIn.pathname === "/sign-in", `approval did not ask a signed-out person to sign in: ${signIn}`);
  const redirect = signIn.searchParams.get("redirect") ?? "";
  assert(redirect.startsWith("/device/approve"), `sign-in would not return to approval: ${redirect}`);
  return redirect;
}

/** Clicks Connect on the approval page, then polls like the desktop app. */
async function connectDevice(
  go: ReturnType<typeof browser>,
  device: { device_code: string; user_code: string },
) {
  const page = await go(`${IDENTITY}/device/approve?user_code=${device.user_code}`);
  assert(page.status === 200 && /id="approve"/.test(await page.text()), `no Connect button: ${page.status}`);
  const approve = await go(`${IDENTITY}/api/auth/device/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: IDENTITY },
    body: JSON.stringify({ userCode: device.user_code }),
  });
  assert(approve.ok, `Connect failed: ${approve.status} ${await approve.text()}`);
  const token = await app.request(`${IDENTITY}/api/auth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: "commons-desktop",
    }),
  });
  const body = (await token.json()) as { access_token?: string };
  assert(token.ok && body.access_token, `the desktop app got no token: ${token.status} ${JSON.stringify(body)}`);
}

await journey("first-time person connects the desktop app with Google", async () => {
  const device = await startDeviceSignIn();
  const go = browser();
  const redirect = await openDeviceLinkSignedOut(go, device.user_code);
  googleProfile = { sub: "google-desktop", email: "desktop-google@example.com", email_verified: true, name: "Desk Top" };
  const social = await go(`${IDENTITY}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: IDENTITY },
    body: JSON.stringify({ provider: "google", callbackURL: redirect }),
  });
  const google = new URL(((await social.json()) as { url: string }).url);
  const back = location(await go(`${IDENTITY}/api/auth/callback/google?${new URLSearchParams({
    code: "google-code", state: google.searchParams.get("state")!,
  })}`));
  assert(back.pathname === "/device/approve", `Google did not return to approval: ${back}`);
  await connectDevice(go, device);
  const again = await (await go(`${IDENTITY}/device/approve?user_code=${device.user_code}`)).text();
  assert(/already (connected|used)/.test(again) && !/id="approve"/.test(again),
    "reopening a connected code should say so instead of offering Connect");
});

await journey("first-time person connects the desktop app after signing up with email", async () => {
  const device = await startDeviceSignIn();
  const go = browser();
  const redirect = await openDeviceLinkSignedOut(go, device.user_code);
  const signUp = await go(`${IDENTITY}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: IDENTITY },
    body: JSON.stringify({
      name: "Desk Top", email: "desktop-email@example.com", password: "desktop-password-123", callbackURL: redirect,
    }),
  });
  assert(signUp.ok, `sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const verify = sentTo("desktop-email@example.com").at(-1);
  assert(verify, "no verification email was sent");
  const back = location(await go(linkIn(verify)));
  assert(back.pathname === "/device/approve", `verification did not return to approval: ${back}`);
  await connectDevice(go, device);
});

console.log(JSON.stringify({ passed: Object.keys(results).length }, null, 2));
