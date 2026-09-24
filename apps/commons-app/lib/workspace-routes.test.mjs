import assert from "node:assert/strict";
import test from "node:test";
import { isLockedStudioDetailRoute, resolveWorkspaceRoute } from "./workspace-routes.ts";

test("studio, library, and session paths resolve consistently", () => {
  assert.deepEqual(resolveWorkspaceRoute("/studio/agents"), { section: "agents", id: undefined, isDetail: false });
  assert.deepEqual(resolveWorkspaceRoute("/studio/agents/abc"), { section: "agents", id: "abc", isDetail: true });
  assert.deepEqual(resolveWorkspaceRoute("/sessions/one"), { section: "sessions", id: "one", isDetail: true });
  assert.equal(resolveWorkspaceRoute("/library?tab=apps").section, "apps");
  assert.equal(isLockedStudioDetailRoute("/studio/agents/abc"), true);
  assert.equal(isLockedStudioDetailRoute("/studio/agents/create"), false);
});
