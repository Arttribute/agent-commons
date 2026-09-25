import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentIdentityPrompt, buildSkillPromptIndex, buildWorkspaceModeContext, findMatchingSkills } from "./index.cjs";

test("cloud and local skill matching uses the same trigger rules", () => {
  const skills = [
    { slug: "create-documents", name: "Create Documents", description: "Write documents", triggers: ["DOCX", "report"], instructions: "Create a complete document." },
    { slug: "build-websites", name: "Build Websites", description: "Build sites", triggers: ["website"], instructions: "Build and verify the site." },
  ];
  const matched = findMatchingSkills(skills, "Please create a DOCX report");
  assert.deepEqual(matched.map((skill) => skill.slug), ["create-documents"]);
  const prompt = buildSkillPromptIndex(skills, matched);
  assert.match(prompt, /invoke_skill/);
  assert.match(prompt, /### create-documents\nCreate a complete document\./);
  assert.doesNotMatch(prompt, /### build-websites/);
});

test("mode context states available resources and the local/cloud boundary", () => {
  assert.match(buildWorkspaceModeContext("private-local"), /Private Local/);
  assert.match(buildWorkspaceModeContext("private-local"), /No Commons Cloud account data/);
  assert.match(buildWorkspaceModeContext("cloud", true), /file and command results cross into this cloud conversation/);
  assert.match(buildWorkspaceModeContext("cloud"), /No desktop filesystem workspace is connected/);
  const desktop = buildWorkspaceModeContext("cloud", false, true);
  assert.match(desktop, /their own computer, not an agent-hosted computer/);
  assert.match(desktop, /choose a folder with the desktop folder button/);
  assert.match(buildWorkspaceModeContext("cloud", true, true), /A user-selected folder on their computer/);
});

test("cloud and local agent prompts use one identity block", () => {
  const prompt = buildAgentIdentityPrompt({ id: "agent-1", name: "Commons Copilot", persona: "Helpful guide", instructions: "Verify work." });
  assert.match(prompt, /Agent ID: agent-1/);
  assert.match(prompt, /Name: Commons Copilot/);
  assert.match(prompt, /model provider as the engine powering you, not your assistant identity/);
  assert.match(prompt, /Persona: Helpful guide/);
  assert.match(prompt, /Instructions: Verify work\./);
});
