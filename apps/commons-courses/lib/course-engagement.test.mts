import assert from "node:assert/strict";
import test from "node:test";
import { buildCourseEngagement } from "./course-engagement.ts";
import type { LiveActivity } from "../types/live-session.ts";

const activities: LiveActivity[] = [
  {
    id: "poll",
    type: "poll",
    title: "Priority",
    status: "closed",
    required: true,
    randomizeOptions: false,
    showResults: false,
    points: 0,
    options: [
      { id: "a", label: "Planning" },
      { id: "b", label: "Communication" },
    ],
  },
  {
    id: "quiz",
    type: "quiz",
    title: "Check",
    status: "closed",
    required: true,
    randomizeOptions: false,
    showResults: false,
    points: 1,
    options: [{ id: "correct", label: "Correct", isCorrect: true }],
  },
];

test("builds educator engagement signals without anonymising learner evidence", () => {
  const result = buildCourseEngagement({
    activities,
    participants: [
      {
        _id: "participant-1",
        userId: "user-1",
        displayName: "Amina",
        email: "amina@example.com",
        status: "active",
        joinedAt: "2026-08-15T08:00:00.000Z",
        lastSeenAt: "2026-08-15T16:00:00.000Z",
      },
      {
        _id: "participant-2",
        userId: "user-2",
        displayName: "Kamau",
        email: "kamau@example.com",
        status: "active",
        joinedAt: "2026-08-15T08:00:00.000Z",
        lastSeenAt: "2026-08-15T15:00:00.000Z",
      },
    ],
    responses: [
      {
        participantId: "participant-1",
        userId: "user-1",
        activityId: "poll",
        value: "a",
        submittedAt: "2026-08-15T09:00:00.000Z",
      },
      {
        participantId: "participant-1",
        userId: "user-1",
        activityId: "quiz",
        value: "correct",
        correct: true,
        submittedAt: "2026-08-15T10:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(result.summary, {
    attendees: 2,
    engagedLearners: 1,
    participationRate: 50,
    responseCount: 2,
    quizAccuracy: 100,
  });
  assert.equal(result.activities[0].options[0].percent, 100);
  assert.equal(result.activities[0].responses[0].participantName, "Amina");
  assert.equal(result.learners[0].responseRate, 100);
  assert.equal(result.learners[1].responseRate, 0);
});

test("summarises captured and shortlisted routines for educators", () => {
  const result = buildCourseEngagement({
    activities: [
      {
        id: "routines",
        type: "prioritization",
        title: "Choose your quick win",
        status: "closed",
        required: true,
        randomizeOptions: false,
        showResults: false,
        points: 0,
        options: [],
        minItems: 2,
        maxSelections: 1,
      },
    ],
    participants: [
      {
        _id: "participant-1",
        userId: "user-1",
        displayName: "Amina",
        email: "amina@example.com",
        status: "active",
        joinedAt: "2026-08-15T08:00:00.000Z",
        lastSeenAt: "2026-08-15T16:00:00.000Z",
      },
    ],
    responses: [
      {
        participantId: "participant-1",
        userId: "user-1",
        activityId: "routines",
        value: {
          finalized: true,
          items: [
            { id: "one", text: "Prepare weekly updates", selected: true },
            { id: "two", text: "Triage the shared inbox", selected: false },
          ],
        },
        submittedAt: "2026-08-15T10:00:00.000Z",
      },
    ],
  });

  assert.equal(result.summary.engagedLearners, 1);
  assert.equal(
    result.activities[0].responses[0].value,
    "Shortlisted: Prepare weekly updates · 2 captured",
  );
});
