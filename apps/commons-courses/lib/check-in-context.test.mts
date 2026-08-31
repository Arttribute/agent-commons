import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLiveCheckInContext,
  checkInContextForUser,
} from "./check-in-context.ts";

test("recalls an explicit outcome contract and its evidence", () => {
  const context = buildLiveCheckInContext({
    userId: "learner-1",
    activities: [
      {
        id: "discover-outcome-contract",
        title: "Your outcome contract",
        type: "worksheet",
      },
    ],
    responses: [
      {
        userId: "learner-1",
        activityId: "discover-outcome-contract",
        value: {
          values: {
            outcome: "Automate weekly reporting so I have more time for analysis.",
            evidence: "A tested report-preparation skill.",
          },
        },
      },
    ],
  });

  assert.equal(context?.source, "outcome_contract");
  assert.match(context?.context || "", /Automate weekly reporting/);
  assert.match(context?.context || "", /tested report-preparation skill/);
});

test("uses a chosen task as a clearly labelled fallback", () => {
  const context = buildLiveCheckInContext({
    userId: "learner-2",
    activities: [
      {
        id: "task-cards",
        title: "Task anatomy cards",
        type: "card_collection",
        itemTitleFieldId: "task-name",
      },
      {
        id: "first-task",
        title: "Choose the first task",
        type: "linked_scorecard",
      },
    ],
    responses: [
      {
        userId: "learner-2",
        activityId: "task-cards",
        value: {
          items: [
            { id: "one", values: { "task-name": "Meeting-note filing" } },
          ],
        },
      },
      {
        userId: "learner-2",
        activityId: "first-task",
        value: {
          items: [{ sourceItemId: "one" }],
          selectedItemId: "one",
          selectionReason: "It is frequent and easy to verify.",
        },
      },
    ],
  });

  assert.equal(context?.source, "chosen_focus");
  assert.match(context?.context || "", /The focus you chose/);
  assert.match(context?.context || "", /Meeting-note filing/);
});

test("selects only the current learner's personalized context", () => {
  const context = checkInContextForUser(
    [
      { userId: "one", context: "First learner" },
      { userId: "two", context: "Second learner" },
    ],
    "two",
  );
  assert.equal(context?.context, "Second learner");
});
