import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLiveLearnerCopilotPolicy,
  normalizeLiveLearnerCopilotPolicy,
} from "./live-copilot-policy.ts";

test("uses a safe backward-compatible live copilot policy", () => {
  assert.deepEqual(
    normalizeLiveLearnerCopilotPolicy(),
    defaultLiveLearnerCopilotPolicy,
  );
});

test("normalizes every educator-controlled live copilot permission", () => {
  assert.deepEqual(
    normalizeLiveLearnerCopilotPolicy({
      enabled: false,
      explainCurrentActivity: false,
      coachResponses: false,
      useCourseMaterials: false,
      giveDirectExplanations: true,
    }),
    {
      enabled: false,
      explainCurrentActivity: false,
      coachResponses: false,
      useCourseMaterials: false,
      giveDirectExplanations: true,
    },
  );
});
