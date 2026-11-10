import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProjectPageChatRequest,
  projectPageFrameUrl,
  projectPageRequestOrigin,
} from "./page-bridge.ts";
test("a server host derives the visitor origin from its proxy headers", () => {
  const origin = (values: Record<string, string>) =>
    projectPageRequestOrigin(new Headers(values));
  assert.equal(
    origin({
      host: "internal:3000",
      "x-forwarded-host": "commonlab.agentcommons.io",
      "x-forwarded-proto": "https",
    }),
    "https://commonlab.agentcommons.io",
  );
  assert.equal(
    origin({ host: "localhost:3002", "x-forwarded-proto": "http" }),
    "http://localhost:3002",
  );
  assert.equal(origin({ host: "Example.test" }), "https://example.test");
  assert.equal(
    origin({ "x-forwarded-host": "a.test, b.test", host: "c.test" }),
    "https://a.test",
  );
  for (const values of [
    {},
    { host: "user@evil.test" },
    { host: "evil.test/path" },
    { host: "a.test", "x-forwarded-proto": "javascript" },
    { host: "a.test:99999" },
  ])
    assert.equal(origin(values), "");
});
test("a frame can only request chat with its source and nonce", () => {
  const frame = {},
    data = { type: "commons-page:chat", nonce: "nonce", id: "request-1" };
  assert.equal(
    isProjectPageChatRequest(
      { source: frame, origin: "null", data },
      frame,
      "nonce",
      "https://assets.test",
    ),
    true,
  );
  for (const event of [
    { source: {}, origin: "null", data },
    { source: frame, origin: "https://other.test", data },
    { source: frame, origin: "null", data: { ...data, nonce: "wrong" } },
    { source: frame, origin: "null", data: { ...data, type: "run-agent" } },
  ])
    assert.equal(
      isProjectPageChatRequest(event, frame, "nonce", "https://assets.test"),
      false,
    );
});
test("only safe asset addresses receive the public host context", () => {
  const url = new URL(
    projectPageFrameUrl(
      "https://assets.test/index.html",
      "camp",
      "https://commonlab.test",
      "nonce",
      true,
    ),
  );
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("commonsChat"), "1");
  assert.throws(() =>
    projectPageFrameUrl("javascript:alert(1)", "camp", "", "", true),
  );
  assert.throws(() =>
    projectPageFrameUrl(
      "https://user:password@assets.test",
      "camp",
      "",
      "",
      true,
    ),
  );
  assert.throws(() =>
    projectPageFrameUrl("http://assets.test", "camp", "", "", true),
  );
});
