import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudVisiblePreferences, mergeWorkspacePreferences } from "./workspace-preferences.ts";

test("shared display settings cross modes but local app pins cannot enter the cloud view", () => {
  const local = mergeWorkspacePreferences({}, {
    agentsPerPage: { value: 20, updatedAt: 10 },
    pinnedAppIds: { value: ["private-project"], updatedAt: 10 },
  }, "private-local");
  assert.deepEqual(cloudVisiblePreferences(local), { agentsPerPage: { value: 20, updatedAt: 10 } });
  const cloud = mergeWorkspacePreferences(local, {
    agentsPerPage: { value: 50, updatedAt: 11 },
    pinnedAppIds: { value: ["cloud-app"], updatedAt: 11 },
  }, "cloud");
  assert.equal(cloud.agentsPerPage.value, 50);
  assert.deepEqual(cloud.pinnedAppIds.value, ["private-project"]);
});

test("older and invalid preferences cannot replace the latest valid value", () => {
  const current = { agentsPerPage: { value: 10, updatedAt: 100 } };
  assert.deepEqual(mergeWorkspacePreferences(current, { agentsPerPage: { value: 20, updatedAt: 99 } }, "cloud"), current);
  assert.deepEqual(mergeWorkspacePreferences(current, { agentsPerPage: { value: 13, updatedAt: 101 } }, "cloud"), current);
});
