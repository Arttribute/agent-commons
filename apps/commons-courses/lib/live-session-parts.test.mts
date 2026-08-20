import assert from "node:assert/strict";
import test from "node:test";
import {
  activityStatusesForParts,
  effectiveActivityPace,
  isActivityPartOpen,
} from "./live-session-parts.ts";
import type { LiveActivity, LiveSessionPart } from "../types/live-session.ts";

const activities = [
  activity("discover-1"),
  activity("capture-1"),
  activity("capture-2"),
];
const parts: LiveSessionPart[] = [
  {
    id: "discover",
    title: "Discover",
    status: "open",
    pace: "learner",
    activityIds: ["discover-1"],
  },
  {
    id: "capture",
    title: "Capture",
    status: "closed",
    pace: "facilitator",
    activityIds: ["capture-1", "capture-2"],
  },
];

test("uses per-session pace and blocks activities in a closed programme session", () => {
  const session = { pace: "facilitator" as const, parts };
  assert.equal(effectiveActivityPace(session, "discover-1"), "learner");
  assert.equal(effectiveActivityPace(session, "capture-1"), "facilitator");
  assert.equal(isActivityPartOpen(session, "discover-1"), true);
  assert.equal(isActivityPartOpen(session, "capture-1"), false);
});

test("opens every activity in a learner-guided part and hides a closed part", () => {
  assert.deepEqual(
    activityStatusesForParts({
      activities,
      parts,
      currentActivityId: "discover-1",
    }),
    {
      "discover-1": "open",
      "capture-1": "draft",
      "capture-2": "draft",
    },
  );
});

test("an educator-guided open part exposes only the presented activity", () => {
  const educatorGuided = parts.map((part) => ({
    ...part,
    status: part.id === "capture" ? ("open" as const) : ("closed" as const),
  }));
  assert.deepEqual(
    activityStatusesForParts({
      activities,
      parts: educatorGuided,
      currentActivityId: "capture-2",
    }),
    {
      "discover-1": "draft",
      "capture-1": "closed",
      "capture-2": "open",
    },
  );
});

function activity(id: string): LiveActivity {
  return {
    id,
    type: "content",
    title: id,
    status: "draft",
    required: false,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
  };
}
