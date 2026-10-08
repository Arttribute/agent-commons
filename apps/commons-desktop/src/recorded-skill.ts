// Keep the observed workflow, its prerequisites and its replay checks together.
// A recording is evidence, not proof of unseen controls or actions.
export const RECORDED_SKILL_FIELDS = ["inputs", "steps", "outputs", "successChecks", "uncertainties", "triggers", "tools"];

export function recordedSkillInstructions(args: Record<string, unknown>, evidence?: string, availableTools?: string[]) {
  const arrays: Record<string, string[]> = {};
  for (const field of RECORDED_SKILL_FIELDS) {
    const value = args[field];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
      throw new Error(`Recorded skills require ${field} as an array of nonempty strings. Put the workflow in these fields, not only in description.`);
    }
    arrays[field] = value.map((entry) => entry.trim());
    if (!["uncertainties", "tools"].includes(field) && !arrays[field].length) {
      throw new Error(`Recorded skills require at least one ${field} entry. Unknown example values should be parameters or prerequisites.`);
    }
  }
  const unavailable = availableTools && arrays.tools.filter((name) => !availableTools.includes(name));
  if (unavailable?.length) throw new Error(`These are not available tool names: ${unavailable.join(', ')}. Use exact available tools, or an empty tools array for manual replay. Put application access and unsupported operations in inputs/prerequisites, not invented tool names.`);
  const task = String(args.instructions ?? "").trim();
  if (!task) throw new Error("Recorded skills require a task in instructions.");
  if (evidence && /\bbuttons?\b/i.test([task, ...arrays.steps].join("\n")) && !/\bbuttons?\b/i.test(evidence)) {
    throw new Error("The recording evidence does not identify any buttons. Describe the observed sequence and make actual controls a replay prerequisite or uncertainty; do not invent button clicks.");
  }
  const list = (field: string) => arrays[field].map((entry) => `- ${entry}`).join("\n");
  return [
    task,
    `## Inputs and prerequisites\n${list("inputs")}`,
    `## Required tools and permissions\n${arrays.tools.length ? list("tools") : "- Manual replay; arrange the required application access before starting."}`,
    `## Steps and decisions\n${arrays.steps.map((entry, index) => `${index + 1}. ${entry}`).join("\n")}`,
    `## Outputs\n${list("outputs")}`,
    `## Success checks\n${list("successChecks")}`,
    `## Uncertainties\n${arrays.uncertainties.length ? list("uncertainties") : "- No additional uncertainty was stated. Sampled frames alone do not prove unseen actions or successful results."}`,
    `## Replay checklist\n- [ ] Confirm the inputs, permissions and available tools.\n${arrays.successChecks.map((entry) => `- [ ] ${entry}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
}
