import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CLOUD_ACCESS, assertCloudToolAllowed, normalizeCloudAccess } from "./cloud-access-policy.mjs";

test("Cloud commands require a separate full computer permission", () => {
  assert.doesNotThrow(() => assertCloudToolAllowed("read_file", DEFAULT_CLOUD_ACCESS));
  assert.doesNotThrow(() => assertCloudToolAllowed("write_file", DEFAULT_CLOUD_ACCESS));
  for (const tool of ["run_command", "start_process", "wait_for_process", "kill_process"]) {
    assert.throws(() => assertCloudToolAllowed(tool, DEFAULT_CLOUD_ACCESS), /Cloud commands are off/);
  }
});

test("missing or invalid Cloud settings cannot enable command access", () => {
  assert.deepEqual(normalizeCloudAccess({ runCommands: "true", readFiles: true }), {
    readFiles: true, writeFiles: false, runCommands: false,
  });
  assert.throws(() => assertCloudToolAllowed("unknown", { ...DEFAULT_CLOUD_ACCESS, runCommands: true }), /Unsupported/);
  const restricted = { readFiles: false, writeFiles: false, runCommands: false };
  assert.throws(() => assertCloudToolAllowed("read_file", restricted), /file reading is off/);
  assert.throws(() => assertCloudToolAllowed("write_file", restricted), /file editing is off/);
});
