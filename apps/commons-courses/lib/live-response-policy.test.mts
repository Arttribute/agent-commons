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
  assert.equal(canReviseLiveResponse(activity("prioritization", "open")), true);
  assert.equal(canReviseLiveResponse(activity("worksheet", "open")), true);
  assert.equal(
    canReviseLiveResponse(activity("card_collection", "open")),
    true,
  );
  assert.equal(
    canReviseLiveResponse(activity("linked_scorecard", "open")),
    true,
  );
});

test("supports any number of structured cards in one repeatable activity", () => {
  const collection = activity("card_collection", "open");
  collection.minItems = 2;
  collection.itemTitleFieldId = "name";
  collection.worksheetFields = [
    { id: "name", label: "Task name", type: "short_text", required: true },
    { id: "steps", label: "Steps", type: "long_text", required: true },
  ];
  const oneCard = {
    items: [{ id: "one", values: { name: "Weekly report" } }],
    finalized: false,
  };
  assert.equal(isValidLiveResponse(collection, oneCard), true);
  assert.equal(
    isValidLiveResponse(collection, { ...oneCard, finalized: true }),
    false,
  );
  assert.equal(
    isValidLiveResponse(collection, {
      items: [
        {
          id: "one",
          values: { name: "Weekly report", steps: "Collect and summarize" },
        },
        {
          id: "two",
          values: { name: "Inbox triage", steps: "Sort and route" },
        },
      ],
      finalized: true,
    }),
    true,
  );
  assert.equal(
    isValidLiveResponse(collection, {
      items: [
        { id: "same", values: { name: "One" } },
        { id: "same", values: { name: "Two" } },
      ],
      finalized: false,
    }),
    false,
  );
});

test("linked scorecards only accept and finalize cards captured by that learner", () => {
  const scorecard = activity("linked_scorecard", "open");
  scorecard.sourceActivityId = "tasks";
  scorecard.scoreCriteria = [
    { id: "impact", label: "Impact", min: 1, max: 5 },
    { id: "safety", label: "Safety", min: 1, max: 5 },
  ];
  const source = {
    items: [
      { id: "one", values: { name: "Weekly report" } },
      { id: "two", values: { name: "Inbox triage" } },
    ],
    finalized: true,
  };
  assert.equal(
    isValidLiveResponse(
      scorecard,
      {
        items: [{ sourceItemId: "one", scores: { impact: 4 } }],
        finalized: false,
      },
      source,
    ),
    true,
  );
  assert.equal(
    isValidLiveResponse(
      scorecard,
      {
        items: [{ sourceItemId: "unknown", scores: { impact: 4 } }],
        finalized: false,
      },
      source,
    ),
    false,
  );
  assert.equal(
    isValidLiveResponse(
      scorecard,
      {
        items: [
          { sourceItemId: "one", scores: { impact: 4, safety: 5 } },
          { sourceItemId: "two", scores: { impact: 3, safety: 4 } },
        ],
        selectedItemId: "two",
        selectionReason: "Easy to verify and reverse.",
        finalized: true,
      },
      source,
    ),
    true,
  );
});

test("validates worksheet progress and required fields before completion", () => {
  const worksheet = activity("worksheet", "open");
  worksheet.worksheetFields = [
    { id: "outcome", label: "Outcome", type: "long_text", required: true },
    {
      id: "confidence",
      label: "Confidence",
      type: "scale",
      required: false,
      min: 1,
      max: 5,
    },
  ];
  assert.equal(
    isValidLiveResponse(worksheet, {
      values: { confidence: 3 },
      finalized: false,
    }),
    true,
  );
  assert.equal(
    isValidLiveResponse(worksheet, {
      values: { confidence: 3 },
      finalized: true,
    }),
    false,
  );
  assert.equal(
    isValidLiveResponse(worksheet, {
      values: { outcome: "Automate my weekly report", confidence: 4 },
      finalized: true,
    }),
    true,
  );
  assert.equal(
    isValidLiveResponse(worksheet, {
      values: { confidence: 8 },
      finalized: false,
    }),
    false,
  );
});

test("validates a multi-entry shortlist while preserving in-progress saves", () => {
  const shortlist = activity("prioritization", "open");
  shortlist.minItems = 3;
  shortlist.maxSelections = 2;
  const items = [
    { id: "one", text: "Weekly status report", selected: true },
    { id: "two", text: "Meeting follow-up", selected: false },
    { id: "three", text: "Inbox triage", selected: true },
  ];
  assert.equal(
    isValidLiveResponse(shortlist, {
      items: items.slice(0, 1),
      finalized: false,
    }),
    true,
  );
  assert.equal(
    isValidLiveResponse(shortlist, { items, finalized: true }),
    true,
  );
  assert.equal(
    isValidLiveResponse(shortlist, {
      items: [...items, { id: "four", text: "Research", selected: true }],
      finalized: true,
    }),
    false,
  );
});

test("accepts a non-empty typed Other response only when enabled", () => {
  const poll = activity("poll", "open");
  poll.options = [{ id: "listed", label: "Listed" }];
  poll.allowOther = true;
  assert.equal(isValidLiveResponse(poll, "listed"), true);
  assert.equal(
    isValidLiveResponse(poll, encodeOtherResponse("A different task")),
    true,
  );
  assert.equal(isValidLiveResponse(poll, encodeOtherResponse("   ")), false);
  poll.allowOther = false;
  assert.equal(
    isValidLiveResponse(poll, encodeOtherResponse("A different task")),
    false,
  );
  assert.equal(
    decodeOtherResponse(encodeOtherResponse("A different task")),
    "A different task",
  );
});

test("compares current and saved response values", () => {
  assert.equal(sameLiveResponseValue("option-a", "option-a"), true);
  assert.equal(sameLiveResponseValue("option-b", "option-a"), false);
  assert.equal(sameLiveResponseValue(["b", "a"], ["a", "b"]), true);
  assert.equal(
    sameLiveResponseValue(
      { items: [{ id: "one", values: { name: "Task" } }], finalized: false },
      { items: [{ id: "one", values: { name: "Task" } }], finalized: false },
    ),
    true,
  );
  assert.equal(
    sameLiveResponseValue(
      {
        items: [{ sourceItemId: "one", scores: { impact: 4 } }],
        finalized: false,
      },
      {
        items: [{ sourceItemId: "one", scores: { impact: 3 } }],
        finalized: false,
      },
    ),
    false,
  );
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
