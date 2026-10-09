import assert from "node:assert/strict";
import test from "node:test";
import { requestsSkillCreation, requestsSkillReplay } from "./local-skill-intent.ts";

test("replaying a saved skill and saving its output does not request another skill save", () => {
  const request = 'Use the saved skill export-completed-reports on replay-report.csv. Filter status=completed, save replay-completed.csv with every original column, and verify the rows. Invoke the saved skill first.';
  assert.equal(requestsSkillCreation(request), false);
  assert.equal(requestsSkillReplay(request), true);
});

test("recording conversion and explicit skill creation still require a registered skill", () => {
  for (const request of ['Create and save a private reusable skill from my recording', 'Turn this recording into a meaningful skill', 'Save the skill export-reports', 'Use the existing skill and create a new reusable skill']) assert.equal(requestsSkillCreation(request), true, request);
  assert.equal(requestsSkillCreation('How do I create a skill?'), false);
});
