import assert from "node:assert/strict";
import test from "node:test";
import type { LiveActivity } from "../types/live-session.ts";
import {
  canReviseLiveResponse,
  sameLiveResponseValue,
} from "./live-response-policy.ts";

test("allows saved poll answers to change only while the poll is open", () => {
  assert.equal(canReviseLiveResponse(activity("poll", "open")), true);
  assert.equal(canReviseLiveResponse(activity("poll", "closed")), false);
  assert.equal(canReviseLiveResponse(activity("quiz", "open")), false);
});

test("compares current and saved response values", () => {
  assert.equal(sameLiveResponseValue("option-a", "option-a"), true);
  assert.equal(sameLiveResponseValue("option-b", "option-a"), false);
  assert.equal(sameLiveResponseValue(["b", "a"], ["a", "b"]), true);
});

function activity(
  type: LiveActivity["type"],
  status: LiveActivity["status"],
): LiveActivity {
  return {
    id: "activity",
    type,
    title: "Activity",
    status,
    required: false,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
  };
}
