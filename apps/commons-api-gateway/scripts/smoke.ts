process.env.COMMONS_GATEWAY_NO_LISTEN = "true";
process.env.RATE_LIMIT_PER_MINUTE = "10";
// Leaving the upstream unset makes the public-route assertions below
// self-evident: a route that reaches `publicProxy` answers 503
// ("not configured"), which is only possible if it skipped the credential
// check. Anything still gated answers 401 before proxying.
delete process.env.AGENT_COMMONS_INTERNAL_URL;
delete process.env.COMMON_OS_INTERNAL_URL;
export {};

const { createGatewayApp } = await import("../src/index.js");
const app = createGatewayApp();

const failures: string[] = [];

async function expectStatus(
  label: string,
  request: Promise<Response> | Response,
  expected: number,
) {
  const response = await request;
  if (response.status !== expected) {
    failures.push(
      `${label}: expected ${expected}, got ${response.status}`,
    );
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
];

for (const [path, init] of publicRoutes) {
  await expectStatus(`public ${init?.method ?? "GET"} ${path}`, app.request(path, init), 503);
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

if (failures.length > 0) {
  console.error("Gateway smoke test failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `Gateway smoke test passed (${publicRoutes.length} public, ${protectedRoutes.length} protected routes verified).`,
);
