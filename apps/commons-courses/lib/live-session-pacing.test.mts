import assert from "node:assert/strict";
import test from "node:test";
import type { LiveActivity } from "../types/live-session.ts";
import { activityStatusesForLivePace } from "./live-session-pacing.ts";

const activities = [
  activity("first", "closed"),
  activity("current", "open"),
  activity("future", "draft"),
];

test("learner pace opens the complete run of show", () => {
  assert.deepEqual(
    activityStatusesForLivePace({
      activities,
      currentActivityId: "current",
      pace: "learner",
    }),
    {
      currentActivityId: "current",
      statuses: { first: "open", current: "open", future: "open" },
    },
  );
});

test("facilitator pace keeps only the presented activity open", () => {
  assert.deepEqual(
    activityStatusesForLivePace({
      activities,
      currentActivityId: "current",
      pace: "facilitator",
    }),
    {
      currentActivityId: "current",
      statuses: { first: "closed", current: "open", future: "closed" },
    },
  );
});

test("falls back to the first activity when the presented id is stale", () => {
  const result = activityStatusesForLivePace({
    activities,
    currentActivityId: "missing",
    pace: "learner",
  });
  assert.equal(result.currentActivityId, "first");
});

function activity(
  id: string,
  status: LiveActivity["status"],
): LiveActivity {
  return {
    id,
    status,
    type: "content",
    title: id,
    required: false,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
  };
}
