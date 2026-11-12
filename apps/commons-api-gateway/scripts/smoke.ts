process.env.COMMONS_GATEWAY_NO_LISTEN = "true";
process.env.RATE_LIMIT_PER_MINUTE = "10";
// Leaving the upstream unset makes the public-route assertions below
// self-evident: a route that reaches `publicProxy` answers 503
// ("not configured"), which is only possible if it skipped the credential
// check. Anything still gated answers 401 before proxying.
delete process.env.AGENT_COMMONS_INTERNAL_URL;
delete process.env.COMMON_OS_INTERNAL_URL;
export {};

const { createGatewayApp, publicAssetRequestHeaders } = await import(
  "../src/index.js"
);
const app = createGatewayApp();

const failures: string[] = [];

const sanitizedPublicHeaders = publicAssetRequestHeaders({
  authorization: "Bearer should-not-leave-the-gateway",
  cookie: "session=should-not-leave-the-gateway",
  "proxy-authorization": "Basic should-not-leave-the-gateway",
  "x-owner-id": "owner-1",
  "x-initiator": "user-1",
  "x-commons-actor-id": "actor-1",
  "x-commons-signature": "forged",
  accept: "text/html",
});
for (const sensitiveHeader of [
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-owner-id",
  "x-initiator",
  "x-commons-actor-id",
  "x-commons-signature",
]) {
  if (sanitizedPublicHeaders.has(sensitiveHeader)) {
    failures.push(`public asset proxy leaked ${sensitiveHeader}`);
  }
}
if (sanitizedPublicHeaders.get("accept") !== "text/html") {
  failures.push("public asset proxy removed a harmless content header");
}

async function expectStatus(
  label: string,
  request: Promise<Response> | Response,
  expected: number,
) {
  const response = await request;
  if (response.status !== expected) {
    failures.push(`${label}: expected ${expected}, got ${response.status}`);
  }
}

await expectStatus("GET /health", app.request("/health"), 200);

/**
 * Routes that must answer without a Commons credential.
 *
 * The gateway authenticates every other `/v1/*` request before the upstream
 * Nest app is reached, so marking a handler `@Public()` downstream has no
 * effect on its own — the route has to be listed here too. Production served
 * a 401 plan catalog to signed-out visitors for exactly this reason, which
 * left /plans spinning forever. Keep this list and the gateway in step.
 */
const publicRoutes: Array<[string, RequestInit?]> = [
  ["/v1/desktop-search/search?q=python"],
  ["/v1/billing/catalog"],
  ["/v1/project-pages/ai-kids-hacker-camp"],
  ["/v1/project-pages/ai-kids-hacker-camp/chat", { method: "POST" }],
  ["/v1/public-events/ai-kids-hacker-camp"],
  ["/v1/public-events/ai-kids-hacker-camp/checkout", { method: "POST" }],
  ["/v1/public-events/ai-kids-hacker-camp/payments/ac_evt_example"],
  [
    "/v1/public-events/ai-kids-hacker-camp/payments/ac_evt_example/verify",
    { method: "POST" },
  ],
  [
    "/v1/event-payments/paystack/00000000-0000-4000-8000-000000000000",
    { method: "POST" },
  ],
  ["/v1/project-page-sdk.js"],
  ["/v1/oauth/providers"],
  ["/v1/oauth/providers/google"],
  ["/v1/oauth/callback/google"],
  ["/v1/billing/webhook", { method: "POST" }],
  ["/v1/files/upload-direct?ticket=invalid", { method: "POST" }],
  ["/v1/previews/example-project/"],
  ["/v1/previews/example-project/assets/index.js"],
  ["/v1/shared/artifacts/example-opaque-token"],
  [
    "/v1/ui-plugin-host?entry=https%3A%2F%2Fapi.agentcommons.io%2Fv1%2Fpreviews%2Fexample-project%2Fdeployments%2F00000000-0000-4000-8000-000000000000%2F&commonsHostOrigin=https%3A%2F%2Fagentcommons.io",
  ],
];

for (const [path, init] of publicRoutes) {
  await expectStatus(
    `public ${init?.method ?? "GET"} ${path}`,
    app.request(path, init),
    503,
  );
}

await expectStatus(
  "page metadata is read-only",
  app.request("/v1/project-pages/camp", { method: "POST" }),
  401,
);

const desktopCors = await app.request(
  "/v1/files/upload-direct?ticket=invalid",
  {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:3100",
      "access-control-request-method": "POST",
    },
  },
);
if (
  desktopCors.headers.get("access-control-allow-origin") !==
  "http://localhost:3100"
)
  failures.push(
    "Desktop Cloud upload preflight must allow the loopback app origin",
  );

/** Routes that carry user data and must stay behind the credential check. */
const protectedRoutes = [
  "/v1/identity",
  "/v1/agents",
  "/v1/project-pages",
  "/v1/projects/00000000-0000-4000-8000-000000000000/events",
  "/v1/projects/00000000-0000-4000-8000-000000000000/events/paystack",
  "/v1/projects/00000000-0000-4000-8000-000000000000/events/00000000-0000-4000-8000-000000000000/registrations",
  "/v1/projects/00000000-0000-4000-8000-000000000000/pages",
  "/v1/flags",
  "/v1/billing/subscription",
  "/v1/billing/entitlements",
];

for (const path of protectedRoutes) {
  await expectStatus(`protected GET ${path}`, app.request(path), 401);
}

await expectStatus(
  "identity rejects unverified legacy credentials",
  app.request("/v1/identity", {
    headers: { authorization: "Bearer sk-ac-not-a-real-key" },
  }),
  401,
);
const nativeFetch = globalThis.fetch;
process.env.COMMONS_IDENTITY_PLATFORM_URL = "https://identity.invalid";
process.env.COMMONS_GATEWAY_INTERNAL_SECRET = "smoke-test-only";
globalThis.fetch = (async () =>
  Response.json({
    active: true,
    actorId: "usr_verified",
    actorType: "user",
    scopes: ["agents:read"],
    credentialType: "oauth",
  })) as typeof fetch;
const identityResponse = await app.request("/v1/identity", {
  headers: { authorization: "Bearer opaque-smoke-token" },
});
const identity = await identityResponse.json();
if (
  identityResponse.status !== 200 ||
  identity.actorId !== "usr_verified" ||
  identity.scopes[0] !== "agents:read" ||
  "legacyToken" in identity
)
  failures.push(
    "identity must return only the authenticated principal and grants",
  );
globalThis.fetch = nativeFetch;
delete process.env.COMMONS_IDENTITY_PLATFORM_URL;
delete process.env.COMMONS_GATEWAY_INTERNAL_SECRET;

const previewResponse = await app.request("/v1/previews/example-project/");
if (previewResponse.headers.has("x-frame-options")) {
  failures.push("public preview: gateway must not add x-frame-options");
}
if (previewResponse.headers.get("access-control-allow-origin") !== "*") {
  failures.push("public preview: sandboxed modules require wildcard CORS");
}
if (previewResponse.headers.has("access-control-allow-credentials")) {
  failures.push("public preview: public assets must not allow credentials");
}

const pluginHostResponse = await app.request(
  "/v1/ui-plugin-host?entry=https%3A%2F%2Fapi.agentcommons.io%2Fv1%2Fpreviews%2Fexample-project%2Fdeployments%2F00000000-0000-4000-8000-000000000000%2F&commonsHostOrigin=https%3A%2F%2Fagentcommons.io",
);
if (pluginHostResponse.headers.has("x-frame-options")) {
  failures.push("UI plugin host: gateway must not add x-frame-options");
}
if (pluginHostResponse.headers.get("access-control-allow-origin") !== "*") {
  failures.push("UI plugin host: opaque sandbox relay requires wildcard CORS");
}
if (pluginHostResponse.headers.has("access-control-allow-credentials")) {
  failures.push("UI plugin host: must not allow credentials");
}

const publicPreflight = await app.request("/v1/public-events/camp/checkout", {
  method: "OPTIONS",
  headers: {
    origin: "https://custom-event.example",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type",
  },
});
if (
  publicPreflight.status !== 204 ||
  publicPreflight.headers.get("access-control-allow-origin") !== "*" ||
  publicPreflight.headers.has("access-control-allow-credentials")
)
  failures.push("Custom event sites need credential-free public API preflight");
process.env.AGENT_COMMONS_INTERNAL_URL = "https://upstream.invalid";
let forwarded: RequestInit | undefined;
globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  forwarded = init;
  return Response.json({ received: true });
}) as typeof fetch;
const rawPayment = '{"event":"charge.success","data":{"reference":"opaque"}}';
const webhookResponse = await app.request(
  "/v1/event-payments/paystack/account-id",
  {
    method: "POST",
    body: rawPayment,
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": "signed-by-paystack",
      "paystack-signature": "t=1,v1=modern",
      authorization: "Bearer ambient-token",
      cookie: "session=ambient-cookie",
    },
  },
);
const paymentHeaders = new Headers(forwarded?.headers);
if (
  webhookResponse.status !== 200 ||
  paymentHeaders.get("x-paystack-signature") !== "signed-by-paystack" ||
  paymentHeaders.get("paystack-signature") !== "t=1,v1=modern" ||
  paymentHeaders.has("authorization") ||
  paymentHeaders.has("cookie") ||
  (await new Response(forwarded?.body as BodyInit).text()) !== rawPayment
)
  failures.push(
    "Payment proxy must preserve raw body and signatures without ambient credentials",
  );
const anonymousResponse = await app.request("/v1/public-events/camp");
if (
  anonymousResponse.headers.get("access-control-allow-origin") !== "*" ||
  anonymousResponse.headers.has("access-control-allow-credentials") ||
  anonymousResponse.headers.get("cache-control") !== "no-store"
)
  failures.push(
    "Public event responses require wildcard CORS and no shared cache",
  );
globalThis.fetch = nativeFetch;
delete process.env.AGENT_COMMONS_INTERNAL_URL;

if (failures.length > 0) {
  console.error("Gateway smoke test failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Gateway smoke test passed (${publicRoutes.length} public, ${protectedRoutes.length} protected routes verified).`,
);
