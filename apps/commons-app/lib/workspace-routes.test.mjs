import assert from "node:assert/strict";
import test from "node:test";
import { hasOwnMobileHeader, isAgentsChatRoute, isLockedStudioDetailRoute, navigationSection, resolveWorkspaceRoute } from "./workspace-routes.ts";

test("studio, library, and session paths resolve consistently", () => {
  assert.deepEqual(resolveWorkspaceRoute("/studio/agents"), { section: "agents", id: undefined, isDetail: false });
  assert.deepEqual(resolveWorkspaceRoute("/studio/agents/abc"), { section: "agents", id: "abc", isDetail: true });
  assert.deepEqual(resolveWorkspaceRoute("/sessions/one"), { section: "sessions", id: "one", isDetail: true });
  assert.equal(resolveWorkspaceRoute("/library?tab=apps").section, "apps");
  assert.equal(isLockedStudioDetailRoute("/studio/agents/abc"), true);
  assert.equal(isLockedStudioDetailRoute("/studio/agents/create"), false);
});

test("projects and customize sections resolve to their navigation entries", async () => {
  const { navigationSection, workspacePaths } = await import("./workspace-routes.ts");
  assert.deepEqual(resolveWorkspaceRoute("/projects/p1"), { section: "projects", id: "p1", isDetail: true });
  assert.equal(navigationSection("/studio/customize/tools"), "customize");
  assert.equal(navigationSection("/studio/tools/t1"), "customize");
  assert.equal(navigationSection("/studio/customize/skills/s1"), "customize");
  assert.equal(navigationSection("/sessions/s1"), "agents");
  assert.equal(workspacePaths.workflows, "/studio/customize/workflows");
  assert.equal(isLockedStudioDetailRoute("/studio/customize/skills/s1"), true);
});

test("new chat is its own entry and the agents app keeps the main sidebar as a rail", () => {
  assert.deepEqual(resolveWorkspaceRoute("/new"), { section: "new", isDetail: false });
  assert.equal(navigationSection("/new"), "new");
  assert.equal(navigationSection("/studio/agents/abc"), "agents");
  assert.equal(isAgentsChatRoute("/studio/agents"), true);
  assert.equal(isAgentsChatRoute("/studio/agents/abc"), true);
  assert.equal(isAgentsChatRoute("/studio/agents/create"), true);
  assert.equal(isAgentsChatRoute("/studio/agentsx"), false);
  assert.equal(isAgentsChatRoute("/new"), false);
});

test("chat surfaces bring their own phone header", () => {
  assert.equal(hasOwnMobileHeader("/new"), true);
  assert.equal(hasOwnMobileHeader("/studio/agents/abc"), true);
  assert.equal(hasOwnMobileHeader("/sessions/s1"), true);
  assert.equal(hasOwnMobileHeader("/sessions"), false);
  assert.equal(hasOwnMobileHeader("/projects"), false);
});
