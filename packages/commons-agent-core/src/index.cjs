/**
 * @template {{slug: string, name: string, triggers?: string[] | null}} T
 * @param {T[]} index
 * @param {string} requestText
 * @param {number} limit
 * @returns {T[]}
 */
function findMatchingSkills(index, requestText, limit = 3) {
  const normalized = requestText.toLowerCase();
  if (!normalized) return [];
  return index.filter((skill) =>
    [skill.name, skill.slug, ...(skill.triggers ?? [])].some((trigger) =>
      trigger.length >= 3 && normalized.includes(trigger.toLowerCase()),
    ),
  ).slice(0, limit);
}

/**
 * @param {Array<{slug: string, name: string, description: string, triggers?: string[] | null}>} index
 * @param {Array<{slug: string, name: string, description: string, instructions: string}>} matchedPlaybooks
 */
function buildSkillPromptIndex(index, matchedPlaybooks) {
  if (!index.length) return "";
  const prompt = [
    "## SPECIALIZED SKILLS",
    "These are progressive-disclosure operating playbooks. When the user request matches one, you MUST call invoke_skill with its slug before the first execution tool call, then follow the returned instructions through validation. Load every clearly relevant skill; do not merely mention it.",
    ...index.slice(0, 60).map((skill) =>
      `- ${skill.slug}: ${skill.description}${skill.triggers?.length ? ` Triggers: ${skill.triggers.join(", ")}.` : ""}`,
    ),
  ];
  if (matchedPlaybooks.length) {
    prompt.push(
      "",
      "## MATCHED SKILL PLAYBOOKS",
      "These playbooks matched the current request and are preloaded to guarantee their quality gates. You MUST still call invoke_skill so the execution is visible, then follow this complete playbook rather than improvising a lower-quality shortcut.",
      ...matchedPlaybooks.map((skill) => `### ${skill.slug}\n${skill.instructions}`),
    );
  }
  return prompt.join("\n");
}

const AUTONOMOUS_EXECUTION_CONTRACT = `## AUTONOMOUS EXECUTION CONTRACT
Own each clear request from intent to a verified outcome.
- If the request is clear enough to act, begin immediately. Ask a question only when missing information would materially change the result or authorize a significant external side effect.
- Once execution begins, continue through tool calls, retries, debugging, and validation without handing routine decisions back to the user.
- A plan, code sample, or list of next steps is not completion when tools can perform the work.
- Inspect existing state before changing it. Preserve useful work and avoid creating competing structures.
- Use tool results as evidence. Retry recoverable failures with a changed approach instead of guessing.
- Verify the actual outcome before reporting success. For software work, run the relevant checks; for browser work, inspect the rendered result and fix runtime or console errors.
- Stop only when the outcome is verified, a genuine blocker requires user input or new authority, or an execution limit is reached. When blocked, state the exact evidence and smallest decision needed.
- Keep the final response concise: what changed, what was verified, and any material caveat.`;

function buildWorkspaceModeContext(mode, hasDesktopWorkspace = false, isDesktop = false) {
  if (mode === "private-local") return `## WORKSPACE MODE: PRIVATE LOCAL
Work entirely with the user's computer, using its local model, local agents, local Knowledge Spaces, local skills, and local artifacts. No Commons Cloud account data or cloud integrations are available for this run. Do not claim to have searched or changed cloud resources. The selected workspace is a folder on the user's computer, not the whole disk; distinguish its scope when answering storage questions. Use cli_disk_usage to measure file and folder sizes inside that workspace. Use the provided local tools for files and commands when needed, with their approval rules. Answer ordinary chat naturally and keep the same Commons Copilot tone and task ownership. When asked which mode you are using, answer "Private Local" and say inference uses a model on this computer.`;
  const desktop = isDesktop ? " This conversation is in the Agent Commons desktop app. When the user says 'my computer' or 'this computer', they mean their own computer, not an agent-hosted computer. Do not start or inspect an agent computer to answer that request." : "";
  const access = hasDesktopWorkspace
    ? "A user-selected folder on their computer is available through the provided CLI tools; its file and command results cross into this cloud conversation. Use those tools for requests about their computer, within the selected folder and its approval boundary. For storage questions, call cli_disk_usage to measure sizes instead of guessing from filenames. A selected folder does not imply access to the whole disk."
    : isDesktop
      ? "No folder on the user's computer is connected to this turn. Ask the user to choose a folder with the desktop folder button when local file inspection is needed. State the selected-folder limit clearly; do not claim to have inspected the computer."
      : "No desktop filesystem workspace is connected to this turn. Use only the cloud tools actually provided.";
  return `## WORKSPACE MODE: CLOUD${hasDesktopWorkspace ? " WITH LOCAL FILE TOOLS" : ""}
This run uses Commons Cloud models and cloud services.${desktop} ${access} Never assume Private Local conversations, files, apps, or Knowledge Spaces are present in this cloud workspace.`;
}

/** Keep the agent's identity independent from the model used to run it. */
function buildAgentIdentityPrompt(agent) {
  return [
    "## YOUR IDENTITY",
    `Agent ID: ${agent.id}`,
    `Name: ${agent.name || "Unnamed Agent"}`,
    "When asked about yourself, identify as this Agent Commons agent. Treat the model provider as the engine powering you, not your assistant identity.",
    agent.description ? `Description: ${agent.description}` : "",
    agent.persona ? `Persona: ${agent.persona}` : "",
    agent.instructions ? `Instructions: ${agent.instructions}` : "",
  ].filter(Boolean).join("\n");
}

module.exports = { findMatchingSkills, buildSkillPromptIndex, AUTONOMOUS_EXECUTION_CONTRACT, buildWorkspaceModeContext, buildAgentIdentityPrompt };
