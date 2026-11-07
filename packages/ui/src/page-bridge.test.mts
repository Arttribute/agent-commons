import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProjectPageChatRequest,
  projectPageFrameUrl,
} from "./page-bridge.ts";
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
