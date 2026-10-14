import assert from "node:assert/strict";
import test from "node:test";
import { localTaskReasoning } from "./local-task-reasoning.ts";

test("automatic reasoning continues until requested outputs are confirmed", () => {
  assert.equal(localTaskReasoning(undefined, true, false), true);
  assert.equal(localTaskReasoning(undefined, true, true), false);
  assert.equal(localTaskReasoning(undefined, false, false), false);
});

test("an explicit reasoning preference survives output creation", () => {
  assert.equal(localTaskReasoning("high", true, true), true);
  assert.equal(localTaskReasoning("low", true, false), false);
});
