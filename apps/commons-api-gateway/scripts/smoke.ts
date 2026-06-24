process.env.COMMONS_GATEWAY_NO_LISTEN = "true";
process.env.RATE_LIMIT_PER_MINUTE = "10";
export {};

const { createGatewayApp } = await import("../src/index.js");
const app = createGatewayApp();

const health = await app.request("/health");
const unauthorized = await app.request("/v1/agents");
if (health.status !== 200 || unauthorized.status !== 401) {
  throw new Error("Gateway smoke test failed");
}
console.log(
  JSON.stringify({
    health: await health.json(),
    unauthorized: await unauthorized.json(),
  }),
);
