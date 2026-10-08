import assert from "node:assert/strict";
import test from "node:test";
import { recordedSkillInstructions } from "./recorded-skill.ts";

test("a recorded skill retains supplied parameters, observed steps and output checks for replay", () => {
  const instructions = recordedSkillInstructions({ instructions: "Export filtered reports.", inputs: ["report_source: an authorized report", "output_destination: choose before replay"], steps: ["Inspect report_source", "Apply the demonstrated status filter"], outputs: ["Filtered CSV"], successChecks: ["Read the CSV and confirm every row matches the filter"], uncertainties: ["The application and its actual controls were not visible"], triggers: ["export filtered reports"], tools: [] });
  assert.match(instructions, /report_source: an authorized report/);
  assert.match(instructions, /1\. Inspect report_source\n2\. Apply/);
  assert.match(instructions, /- \[ \] Read the CSV/);
  assert.match(instructions, /actual controls were not visible/);
  assert.doesNotMatch(instructions, /click|button/i);
});

test("an incomplete recorded skill is rejected rather than saved with a misleading description", () => {
  assert.throws(() => recordedSkillInstructions({ instructions: "Do the export", description: "A complete reusable skill" }), /require inputs/);
  assert.throws(() => recordedSkillInstructions({ inputs: ["source"], steps: [], outputs: ["CSV"], successChecks: ["check"], uncertainties: [], triggers: ["export"], tools: [] }), /at least one steps/);
});

test("replay steps cannot claim buttons when sampled evidence only showed text", () => {
  const args = { instructions: "Export reports", inputs: ["authorized report source"], steps: ['Click the Export button'], outputs: ["CSV"], successChecks: ["Read the CSV"], uncertainties: [], triggers: ["export reports"], tools: [] };
  assert.throws(() => recordedSkillInstructions(args, 'A green window displays Export report.csv; no other controls are visible.'), /does not identify any buttons/);
  assert.doesNotThrow(() => recordedSkillInstructions(args, 'An Export button is visible.'));
});

test('recorded skills distinguish tool names from manual application prerequisites', () => {
  const args = { instructions: 'Export reports', inputs: ['Authorized reports application'], steps: ['Apply the demonstrated filter'], outputs: ['CSV'], successChecks: ['Read the exported CSV'], uncertainties: [], triggers: ['export reports'], tools: ['invented_export_button'] };
  assert.throws(() => recordedSkillInstructions(args, undefined, ['read_library_item', 'run_python']), /not available tool names/);
  assert.doesNotThrow(() => recordedSkillInstructions({ ...args, tools: ['run_python'] }, undefined, ['run_python']));
});
