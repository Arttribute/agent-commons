import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { projectRegistrationBootstrap } from "./project-registration-bootstrap.ts";

const nonce = "safe-per-response-nonce-123456";
const page = {
  entryUrl: "https://api.example/previews/camp/",
  registrationUrl: "/register/holiday-camp",
};
function fixture() {
  const listeners = new Map<string, Function>();
  const navigations: string[] = [],
    replies: any[] = [];
  const source = { postMessage: (data: any) => replies.push(data) };
  const window = {
    location: { assign: (path: string) => navigations.push(path) },
    addEventListener: (type: string, cb: Function) => listeners.set(type, cb),
    removeEventListener: (type: string, cb: Function) => {
      if (listeners.get(type) === cb) listeners.delete(type);
    },
  };
  runInNewContext(projectRegistrationBootstrap(page, { nonce })!, {
    window,
    document: { querySelector: () => ({ contentWindow: source }) },
  });
  const event = {
    source,
    origin: "null",
    data: {
      type: "commons-page:register",
      nonce,
      id: "request-id",
      url: "https://untrusted.example/",
    },
  };
  return { listeners, navigations, replies, event };
}
test("registration works before app hydration without a popup or a visitor-selected destination", () => {
  const f = fixture();
  f.listeners.get("message")!(f.event);
  assert.deepEqual(f.navigations, [page.registrationUrl]);
  assert.equal(f.replies[0].nonce, nonce);
  assert.equal(f.replies[0].ok, true);
});
test("early registration rejects the wrong frame, origin, nonce or message type", () => {
  for (const change of [
    { source: {} },
    { origin: "https://untrusted.example" },
    { data: { ...fixture().event.data, nonce: "wrong-nonce" } },
    { data: { ...fixture().event.data, type: "commons-page:chat" } },
  ]) {
    const f = fixture();
    f.listeners.get("message")!({ ...f.event, ...change });
    assert.equal(f.navigations.length, 0);
    assert.equal(f.replies.length, 0);
  }
});
test("hydration hands registration over to the standard frame bridge", () => {
  const f = fixture();
  f.listeners.get("commons-page:hydrated")!({ detail: { nonce: "wrong" } });
  assert(f.listeners.has("message"));
  f.listeners.get("commons-page:hydrated")!({ detail: { nonce } });
  assert(!f.listeners.has("message"));
});
test("external registration destinations cannot be emitted into the bootstrap", () => {
  assert.equal(
    projectRegistrationBootstrap(
      { ...page, registrationUrl: "https://untrusted.example/register/camp" },
      { nonce },
    ),
    null,
  );
  assert.equal(projectRegistrationBootstrap(page, { nonce: "short" }), null);
});
