import assert from "node:assert/strict";
import test from "node:test";
import {
  createLearnerWorkbookHtml,
  learnerWorkbookFilename,
} from "./live-workbook-export.ts";
import type {
  LiveActivity,
  LiveResponseRecord,
  LiveSessionPart,
} from "../types/live-session.ts";

const activities: LiveActivity[] = [
  {
    id: "tasks",
    type: "card_collection",
    title: "Task anatomy cards",
    prompt: "Capture the routines you could offload.",
    status: "open",
    required: true,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
    itemTitleFieldId: "task_name",
    worksheetFields: [
      { id: "task_name", label: "Task", type: "short_text", required: true },
      {
        id: "notes",
        label: "How it works today",
        type: "long_text",
        required: false,
      },
    ],
  },
  {
    id: "priority",
    type: "linked_scorecard",
    title: "Choose the first task to offload",
    status: "open",
    required: true,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
    sourceActivityId: "tasks",
    scoreCriteria: [{ id: "impact", label: "Impact", min: 1, max: 5 }],
  },
  {
    id: "private",
    type: "worksheet",
    title: "Reflection <script>alert(1)</script>",
    status: "open",
    required: false,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [],
    worksheetFields: [
      {
        id: "next",
        label: "What will you do next?",
        type: "long_text",
        required: true,
      },
    ],
  },
];

const responses: Record<string, LiveResponseRecord> = {
  tasks: {
    activityId: "tasks",
    submittedAt: "2026-08-20T10:00:00.000Z",
    value: {
      finalized: true,
      items: [
        {
          id: "task-1",
          values: {
            task_name: "Weekly leadership report",
            notes: "Gather updates & write the summary",
          },
        },
      ],
    },
  },
  priority: {
    activityId: "priority",
    submittedAt: "2026-08-20T10:05:00.000Z",
    value: {
      finalized: true,
      selectedItemId: "task-1",
      selectionReason: "High impact < fast to test",
      items: [{ sourceItemId: "task-1", scores: { impact: 5 } }],
    },
  },
  private: {
    activityId: "private",
    submittedAt: "2026-08-20T10:10:00.000Z",
    value: { finalized: false, values: { next: "Try it with my team" } },
  },
};

const parts: LiveSessionPart[] = [
  {
    id: "discover",
    title: "Day 1: Discover",
    status: "open",
    pace: "learner",
    activityIds: ["tasks", "priority", "private"],
  },
];

test("exports labelled, grouped workbook responses and escapes learner content", () => {
  const html = createLearnerWorkbookHtml({
    courseTitle: "AI Quick Wins for Leaders",
    sessionTitle: "Discover & Capture",
    learnerName: "Amina <Leader>",
    activities,
    parts,
    responses,
    generatedAt: new Date("2026-08-20T12:00:00.000Z"),
  });

  assert.match(html, /Day 1: Discover/);
  assert.match(html, /Task anatomy cards/);
  assert.match(html, /Weekly leadership report/);
  assert.match(html, /How it works today/);
  assert.match(html, /Selected priority/);
  assert.match(html, /Impact/);
  assert.match(html, /Saved in progress/);
  assert.match(html, /Amina &lt;Leader&gt;/);
  assert.match(html, /High impact &lt; fast to test/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, />task_name</);
});

test("can export one saved activity without leaking the other responses", () => {
  const html = createLearnerWorkbookHtml({
    courseTitle: "AI Quick Wins for Leaders",
    sessionTitle: "Discover & Capture",
    learnerName: "Amina",
    activities,
    parts,
    responses,
    activityId: "private",
  });

  assert.match(html, /Reflection &lt;script&gt;/);
  assert.match(html, /Try it with my team/);
  assert.doesNotMatch(html, /Weekly leadership report/);
  assert.match(html, /1 saved activity/);
});

test("creates portable, readable filenames", () => {
  assert.equal(
    learnerWorkbookFilename("AI Quick Wins: Discover", "My first task"),
    "ai-quick-wins-discover-my-first-task-response.html",
  );
});
