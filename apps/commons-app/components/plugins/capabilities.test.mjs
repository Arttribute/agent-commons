import assert from "node:assert/strict";
import test from "node:test";

import { UI_PLUGIN_CAPABILITIES as host } from "./capabilities.ts";
import { UI_PLUGIN_CAPABILITIES as api } from "../../../commons-api/src/ui-plugin/ui-plugin.capabilities.ts";

test("the host capability catalog matches the API catalog", () => {
  assert.deepEqual(host, api);
});
