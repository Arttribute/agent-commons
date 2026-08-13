import assert from "node:assert/strict";
import test from "node:test";
import type {
  LiveActivity,
  LiveActivityOption,
} from "../types/live-session.ts";
import { learnerSafeActivities } from "./live-activity-serialization.ts";

function mongooseLike<T extends object>(value: T) {
  return {
    _doc: value,
    toObject: () => value,
  } as unknown as T;
}

test("serializes complete learner fields from Mongoose-like subdocuments", () => {
  const option = mongooseLike<LiveActivityOption>({
    id: "answer-a",
    label: "The visible answer",
    isCorrect: true,
  });
  const activity = mongooseLike<LiveActivity>({
    id: "current",
    type: "poll",
    title: "The visible title",
    prompt: "The visible prompt",
    facilitatorNotes: "Private",
    status: "open",
    required: true,
    randomizeOptions: false,
    showResults: true,
    points: 0,
    options: [option],
  });

  assert.deepEqual(learnerSafeActivities([activity]), [
    {
      id: "current",
      type: "poll",
      title: "The visible title",
      prompt: "The visible prompt",
      facilitatorNotes: undefined,
      status: "open",
      required: true,
      randomizeOptions: false,
      showResults: true,
      points: 0,
      options: [
        {
          id: "answer-a",
          label: "The visible answer",
          isCorrect: undefined,
        },
      ],
    },
  ]);
});
