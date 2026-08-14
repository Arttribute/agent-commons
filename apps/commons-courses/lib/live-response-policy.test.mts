import assert from "node:assert/strict";
import test from "node:test";
import type { LiveActivity } from "../types/live-session.ts";
import {
  canReviseLiveResponse,
  decodeOtherResponse,
  encodeOtherResponse,
  isValidLiveResponse,
  sameLiveResponseValue,
} from "./live-response-policy.ts";

test("allows saved poll answers to change only while the poll is open", () => {
  assert.equal(canReviseLiveResponse(activity("poll", "open")), true);
  assert.equal(canReviseLiveResponse(activity("poll", "closed")), false);
  assert.equal(canReviseLiveResponse(activity("quiz", "open")), false);
});

test("accepts a non-empty typed Other response only when enabled", () => {
  const poll = activity("poll", "open");
  poll.options = [{ id: "listed", label: "Listed" }];
  poll.allowOther = true;
  assert.equal(isValidLiveResponse(poll, "listed"), true);
  assert.equal(isValidLiveResponse(poll, encodeOtherResponse("A different task")), true);
  assert.equal(isValidLiveResponse(poll, encodeOtherResponse("   ")), false);
  poll.allowOther = false;
  assert.equal(isValidLiveResponse(poll, encodeOtherResponse("A different task")), false);
  assert.equal(decodeOtherResponse(encodeOtherResponse("A different task")), "A different task");
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
