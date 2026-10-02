import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_IP_HEADER, resolveClientIp, withClientIp } from "./client-ip.ts";

// Better Auth substitutes 127.0.0.1 for a missing address outside production,
// which would hide the shared-bucket fallback these tests guard against.
process.env.NODE_ENV = "production";
const { getIp } = await import("@better-auth/core/utils/ip");
const authOptions = {
  advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
};

function edgeRequest(headers) {
  return new Request("https://auth.agentcommons.io/api/auth/oauth2/token", {
    method: "POST",
    headers,
    body: "grant_type=client_credentials",
  });
}

test("a CloudFront request resolves to the viewer, not one shared bucket", async () => {
  const request = edgeRequest({
    "x-forwarded-for": "198.51.100.10, 130.176.1.1",
    "cloudfront-viewer-address": "198.51.100.10:46532",
  });
  // The multi-hop header alone is what Better Auth 1.6.22 rejects.
  assert.equal(getIp(request, {}), null);

  const resolved = withClientIp(request);
  assert.equal(getIp(resolved, authOptions), "198.51.100.10");
  assert.equal(await resolved.text(), "grant_type=client_credentials");
});

test("IPv6 viewer addresses keep every group except the port", () => {
  const headers = new Headers({
    "cloudfront-viewer-address": "2001:db8:3333:4444:5555:6666:7777:8888:443",
  });
  assert.equal(resolveClientIp(headers), "2001:db8:3333:4444:5555:6666:7777:8888");
});

test("without a viewer address the load balancer's peer is used", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 192.0.2.44" });
  assert.equal(resolveClientIp(headers), "192.0.2.44");
});

test("a client cannot choose its own rate-limit address", () => {
  const spoofed = withClientIp(
    edgeRequest({ [CLIENT_IP_HEADER]: "10.0.0.1", "x-forwarded-for": "192.0.2.44" }),
  );
  assert.equal(spoofed.headers.get(CLIENT_IP_HEADER), "192.0.2.44");

  const unresolved = withClientIp(edgeRequest({ [CLIENT_IP_HEADER]: "10.0.0.1" }));
  assert.equal(unresolved.headers.get(CLIENT_IP_HEADER), null);
});
