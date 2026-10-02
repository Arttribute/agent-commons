import assert from "node:assert/strict";
import test from "node:test";
import { REFRESH_RETRY_MS, refreshBlocked, refreshFailure } from "./token-refresh.ts";

const now = 1_000_000;

test("a rejected grant is never retried, so a dead session stops calling identity", () => {
  const token = refreshFailure({ refreshToken: "dead" }, new Response("", { status: 400 }), now);
  assert.equal(token.accessTokenError, "RefreshTokenRejected");
  assert.equal(refreshBlocked(token, now + 24 * 60 * 60 * 1000), true);
});

test("a rate-limited refresh waits for identity's retry hint", () => {
  const response = new Response("", { status: 429, headers: { "x-retry-after": "42" } });
  const token = refreshFailure({}, response, now);
  assert.equal(token.accessTokenError, "RefreshRateLimited");
  assert.equal(refreshBlocked(token, now + 41_000), true);
  assert.equal(refreshBlocked(token, now + 42_001), false);
});

test("network and server failures back off before the next attempt", () => {
  const token = refreshFailure({}, undefined, now);
  assert.equal(token.accessTokenError, "RefreshAccessTokenError");
  assert.equal(refreshBlocked(token, now + REFRESH_RETRY_MS - 1), true);
  assert.equal(refreshBlocked(token, now + REFRESH_RETRY_MS + 1), false);
});

test("a healthy token is free to refresh", () => {
  assert.equal(refreshBlocked({}, now), false);
});
