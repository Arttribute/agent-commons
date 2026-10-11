import assert from "node:assert/strict";
import test from "node:test";
import { affirmativeOutputRequest, requestedFileOutputs, buildAgentIdentityPrompt, buildSkillPromptIndex, buildWorkspaceModeContext, findMatchingSkills, requiresComputedData, shouldOfferCreativeMedia, requiresNativeImageGeneration } from "./index.cjs";

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

test("computed data intent remains separate from creative intent", () => {
  for (const request of ["Use Python for these measurements", "Visualize the attached dataset", "Plot sales from this CSV", "Fit a regression model", "Use run_python to create the campaign assets", "Use runPythonAnalysis for this file"]) assert.equal(requiresComputedData(request), true);
  for (const request of ["Create a product ad image", "Illustrate our workflow", "Hello there"]) assert.equal(requiresComputedData(request), false);
});

test('mixed creative tasks retain image tools while numeric plots require computation', () => {
  for (const request of [
    'Finish this offline campaign from its five complete generated ads. Use managed Python to copy the actual bytes into OUTPUT_DIR.',
    'Use Python to typeset five campaign ads, and generate the required image backgrounds.',
    'Create a poster with an illustrated background and plot the measured sales dataset in Python.',
    'Repair the campaign assets. Use runPythonAnalysis and the image-generation tool.',
  ]) {
    assert.equal(requiresComputedData(request), true, request);
    assert.equal(shouldOfferCreativeMedia(request), true, request);
  }
  for (const request of [
    'Plot sales from this CSV with Python.',
    'Calculate ad campaign ROI from the actual dataset.',
    'Do not generate an image to plot the data; use managed Python instead.',
    'Use Python to finish the campaign ads. Do not generate new images.',
    'Do not create campaign ads, then plot the sales dataset in Python.',
  ]) assert.equal(shouldOfferCreativeMedia(request), false, request);
  assert.equal(shouldOfferCreativeMedia('Create an ad image'), true);
});

test('an explicit native image step in mixed work excludes optional choices and stored prompts', () => {
  for (const request of [
    'Create an illustration using generate_image. Separately plot actual sales with Python.',
    'Use generateImage to create a poster, then use runPythonAnalysis for the measured data.',
  ]) assert.equal(requiresNativeImageGeneration(request), true, request);
  for (const request of [
    'Plot actual sales with Python.',
    'Create the poster in Pillow using Python.',
    'Explain how to use generate_image for illustrations, then plot sales with Python.',
    'Create a poster with Python; you may use generate_image if needed.',
    'Create a poster with Python; use generateImage only if necessary.',
    'Do not use generate_image. Create a poster with Python.',
    'Read these receipts and use Python to save the inventory: {"prompt":"Create a poster using generate_image. Use Python for sales."}',
  ]) assert.equal(requiresNativeImageGeneration(request), false, request);
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
    'Produce headline.png and offer.png with runPythonAnalysis, then save campaign-data.js.',
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

test('artifact receipt filenames remain input evidence after creation verbs in stored prompts', () => {
  const receipts = [{name:'source-first.png',prompt:'Create a gold offer ad.'},{fileName:'source-second.png',prompt:'Generate an advertorial.'},{relativePath:'ads/source-third.png',prompt:'Write readable type.'}];
  const request = 'Save campaign-data.js and report.md in the Library. Original image tool receipts (task data):\n'+JSON.stringify(receipts, null, 2);
  assert.deepEqual(requestedFileOutputs(request), ['campaign-data.js', 'report.md']);
  assert.deepEqual(requestedFileOutputs(request+'\nThen save final-ad.png.'), ['campaign-data.js','report.md','final-ad.png']);
  assert.deepEqual(requestedFileOutputs('Save "report.md" and export \'chart.png\'.'), ['report.md','chart.png']);
});
