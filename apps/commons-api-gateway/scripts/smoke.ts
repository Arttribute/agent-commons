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
  ["/v1/billing/catalog"],
  ["/v1/oauth/providers"],
  ["/v1/oauth/providers/google"],
  ["/v1/oauth/callback/google"],
  ["/v1/billing/webhook", { method: "POST" }],
  ["/v1/previews/example-project/"],
  ["/v1/previews/example-project/assets/index.js"],
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

/** Routes that carry user data and must stay behind the credential check. */
const protectedRoutes = [
  "/v1/agents",
  "/v1/flags",
  "/v1/billing/subscription",
  "/v1/billing/entitlements",
];

for (const path of protectedRoutes) {
  await expectStatus(`protected GET ${path}`, app.request(path), 401);
}

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

if (failures.length > 0) {
  console.error("Gateway smoke test failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Gateway smoke test passed (${publicRoutes.length} public, ${protectedRoutes.length} protected routes verified).`,
);
