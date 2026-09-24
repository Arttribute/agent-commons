export type LocalWorkflowPlanStep = { nodeId: string; agentId: string; prompt: string };
export function compileLocalWorkflow(definition: Record<string, unknown> | undefined, defaultAgentId: string): LocalWorkflowPlanStep[];
