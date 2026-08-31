import assert from "node:assert/strict";
import test from "node:test";
import type { LiveActivity } from "../types/live-session.ts";
import { resolveLearnerActivitySelection } from "./live-learner-selection.ts";

function activity(id: string, status: LiveActivity["status"]): LiveActivity {
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

const activities = [
  activity("closed-first", "closed"),
  activity("presented", "open"),
  activity("upcoming", "draft"),
];

test("facilitator pace always resolves to the presented activity", () => {
  assert.equal(
    resolveLearnerActivitySelection({
      activities,
      currentActivityId: "presented",
      lastPresentedActivityId: "presented",
      pace: "facilitator",
      responses: {},
      selectedActivityId: "closed-first",
    }),
    "presented",
  );
});

test("learner pace follows a newly presented activity once", () => {
  assert.equal(
    resolveLearnerActivitySelection({
      activities,
      currentActivityId: "presented",
      lastPresentedActivityId: "closed-first",
      pace: "learner",
      responses: {},
      selectedActivityId: "closed-first",
    }),
    "presented",
  );
});

test("learner pace does not fall back to an unanswered closed activity", () => {
  assert.equal(
    resolveLearnerActivitySelection({
      activities,
      pace: "learner",
      responses: {},
      selectedActivityId: "closed-first",
    }),
    "presented",
  );
});

test("learner pace preserves browsing after following the presenter", () => {
  assert.equal(
    resolveLearnerActivitySelection({
      activities: [activity("presented", "open"), activity("browse", "open")],
      currentActivityId: "presented",
      lastPresentedActivityId: "presented",
      pace: "learner",
      responses: {},
      selectedActivityId: "browse",
    }),
    "browse",
  );
});
