type PlatformToolFunction = {
  name?: string;
};

const COMMONS_COPILOT_ONLY_TOOLS = new Set([
  'listCommonsResources',
  'proposeWorkflowChange',
  'proposeAgentChange',
  'proposeSkillChange',
  'proposeToolChange',
  'proposeTaskChange',
]);

/**
 * Platform-management proposal tools operate on Agent Commons account state
 * and are authorized only for the account's default system Copilot. Hiding
 * them from other agents keeps those agents from selecting a tool that will
 * deterministically return 403. Callers such as CommonLab can still inject
 * their own scoped tools (for example create_skill_path) through cliTools.
 */
export function filterPlatformToolsForAgent<T extends PlatformToolFunction>(
  tools: T[],
  agent: { isDefault?: boolean; isSystemManaged?: boolean },
) {
  if (agent.isDefault && agent.isSystemManaged) return tools;
  return tools.filter((tool) => !COMMONS_COPILOT_ONLY_TOOLS.has(tool.name || ''));
}
