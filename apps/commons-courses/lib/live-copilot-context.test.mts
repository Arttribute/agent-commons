import assert from "node:assert/strict";
import test from "node:test";
import {
  visibleCopilotActivity,
  publicActivityContext,
  boundedLearnerValue,
  type CopilotLiveSession,
} from "./live-copilot-context.ts";
import { presentationSlides } from "./presentation-content.ts";
import type { LiveActivity } from "../types/live-session.ts";

const activity = (
  id: string,
  status: LiveActivity["status"] = "open",
): LiveActivity => ({
  id,
  status,
  title: id,
  type: "worksheet",
  prompt: "Public instructions",
  facilitatorNotes: "PRIVATE ANSWERS",
  options: [{ id: "one", label: "Visible choice", isCorrect: true }],
  worksheetFields: [],
  required: true,
  randomizeOptions: false,
  showResults: false,
  points: 0,
});
const session: CopilotLiveSession = {
  _id: "session",
  courseId: "course",
  title: "Workshop",
  status: "live",
  pace: "facilitator",
  currentActivityId: "current",
  parts: [
    {
      id: "first",
      title: "Open",
      status: "open",
      pace: "facilitator",
      activityIds: ["current", "old"],
    },
    {
      id: "next",
      title: "Closed",
      status: "closed",
      pace: "learner",
      activityIds: ["locked"],
    },
  ],
  activities: [
    activity("current"),
    activity("old", "closed"),
    activity("locked"),
  ],
};

test("guided copilot follows the presented step and cannot use a requested closed part", () => {
  assert.equal(visibleCopilotActivity(session, "old")?.activity.id, "current");
  assert.equal(
    visibleCopilotActivity(session, "locked")?.activity.id,
    "current",
  );
});
test("learner-paced copilot follows the selected accessible workbook step", () => {
  const next = {
    ...session,
    parts: session.parts!.map((part) => ({
      ...part,
      pace: "learner" as const,
    })),
    activities: [activity("current"), activity("old"), activity("locked")],
  };
  assert.equal(visibleCopilotActivity(next, "old")?.activity.id, "old");
  assert.equal(visibleCopilotActivity(next, "locked")?.activity.id, "current");
});
test("draft, lobby and closed programmes supply no hidden activity context", () => {
  assert.equal(visibleCopilotActivity({ ...session, status: "lobby" }), null);
  assert.equal(visibleCopilotActivity({ ...session, status: "draft" }), null);
  assert.equal(
    visibleCopilotActivity({
      ...session,
      parts: session.parts!.map((part) => ({
        ...part,
        status: "closed" as const,
      })),
    }),
    null,
  );
});
test("activity context omits notes and answer flags even after a quiz is closed", () => {
  const publicContext = publicActivityContext({
    ...activity("quiz", "closed"),
    showResults: true,
  });
  assert.doesNotMatch(
    JSON.stringify(publicContext),
    /PRIVATE ANSWERS|isCorrect|facilitatorNotes/,
  );
  assert.deepEqual(publicContext.options, [
    { id: "one", label: "Visible choice" },
  ]);
});
test("learner deck positions remain correct across omitted original slides", () => {
  const slides = presentationSlides(
    "--- Original slide 1 ---\nWelcome\n\n--- Original slide 3 ---\nCurrent visible slide\n\n--- Original slide 4 ---\nNext slide",
  );
  assert.deepEqual(slides[1], {
    sourceNumber: 3,
    text: "Current visible slide",
  });
  assert.equal(
    presentationSlides("--- Slide 1 ---\nFirst\n--- Slide 2 ---\nSecond")[1]
      .text,
    "Second",
  );
});
test("draft context is bounded and stays distinct from saved work", () => {
  assert.equal(boundedLearnerValue("x".repeat(13000))?.length, 12000);
  assert.equal(
    boundedLearnerValue({ values: { answer: "My own attempt" } }),
    '{"values":{"answer":"My own attempt"}}',
  );
});
