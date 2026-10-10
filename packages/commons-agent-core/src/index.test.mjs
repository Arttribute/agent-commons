import assert from "node:assert/strict";
import test from "node:test";
import { affirmativeOutputRequest, requestedFileOutputs, buildAgentIdentityPrompt, buildSkillPromptIndex, buildWorkspaceModeContext, findMatchingSkills, requiresComputedData } from "./index.cjs";

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

test("computed data tasks cannot select the creative image generator", () => {
  for (const request of ["Use Python for these measurements", "Visualize the attached dataset", "Plot sales from this CSV", "Fit a regression model", "Use run_python to create the campaign assets", "Use runPythonAnalysis for this file"]) assert.equal(requiresComputedData(request), true);
  for (const request of ["Create a product ad image", "Illustrate our workflow", "Hello there"]) assert.equal(requiresComputedData(request), false);
});

test('runtime mentions and negative instructions do not mandate unrelated computations', () => {
  for (const request of [
    'Save campaign-data.js from the supplied schema. Use INPUT_FILES[filename] for actual Python inputs if needed.',
    'Create an ad image for our machine learning product.',
    'Explain Python and regression models.',
    'Write a tutorial about how to use Python for data analysis.',
    'Describe how to fit a regression model.',
    'Show me how to use Python.',
    'Save the supplied HTML. You may use Python if needed.',
    'Use Python if necessary to copy the template.',
    'Do not use Python; copy the supplied HTML unchanged.',
    "Don't run run_python. Save a Markdown report.",
    'Analyze the document wording, without calculating statistics.',
  ]) assert.equal(requiresComputedData(request), false, request);
  for (const request of [
    'Do not generate an image to plot the data; use managed Python instead.',
    'Explain regression, then fit a regression model to the attached CSV.',
    'Compute mean values from these measurements.',
    'Train a classifier on this dataset.',
    'Show a histogram of the measurements.',
    'Use Python if needed to compute the mean of these measurements.',
  ]) assert.equal(requiresComputedData(request), true, request);
});

test('output intent honors negated clauses without losing affirmative work', () => {
  const inspect = 'Extract the ZIP with Python. Read START HERE.md. Do not create campaign outputs yet.';
  assert.doesNotMatch(affirmativeOutputRequest(inspect), /create campaign/);
  assert.match(affirmativeOutputRequest(inspect), /Read START HERE.md/);
  assert.deepEqual(requestedFileOutputs('Do not save input.csv. Save output.csv instead.'), ['output.csv']);
  assert.deepEqual(requestedFileOutputs("Don't create first.png, but generate second.png."), ['second.png']);
  assert.deepEqual(requestedFileOutputs('Generate chart.png without exporting raw.csv.'), ['chart.png']);
  assert.deepEqual(requestedFileOutputs('Never create report.pdf or export source.csv.'), []);
  assert.deepEqual(requestedFileOutputs('Save headline.png. Reload ad-copy.md, preserve brand-sheet.md, then write campaign-data.js.'), ['headline.png', 'campaign-data.js']);
});
