export type CopilotUiContext = {
  pathname?: string;
  pageTitle?: string;
  routeName?: string;
  resourceType?: 'agent' | 'workflow' | 'task' | 'tool' | 'skill';
  resourceId?: string;
  resource?: Record<string, unknown>;
  timeZone?: string;
  locale?: string;
};

export const COMMONS_STUDIO_ROUTES = {
  home: '/studio/agents',
  agents: '/studio/agents',
  createAgent: '/studio/agents/create',
  agent: (id: string) => `/studio/agents/${encodeURIComponent(id)}`,
  agentSession: (id: string, sessionId: string) =>
    `/studio/agents/${encodeURIComponent(id)}?section=sessions&session=${encodeURIComponent(sessionId)}`,
  workflows: '/studio/workflows',
  workflow: (id: string) => `/studio/workflows/${encodeURIComponent(id)}`,
  tasks: '/studio/tasks',
  task: (id: string) => `/studio/tasks/${encodeURIComponent(id)}`,
  tools: '/studio/tools',
  tool: (id: string) => `/studio/tools/${encodeURIComponent(id)}`,
  skills: '/studio/skills',
  skill: (id: string) => `/studio/skills/${encodeURIComponent(id)}`,
  spaces: '/spaces',
  space: (id: string) => `/spaces/${encodeURIComponent(id)}`,
  library: '/library',
  usage: '/usage',
  wallets: '/wallets',
  logs: '/logs',
  billing: '/settings/billing',
  apiKeys: '/settings/api-keys',
} as const;

export function resourceStudioUrl(
  resourceType: string,
  resourceId?: string | null,
) {
  if (!resourceId) {
    if (resourceType === 'agent') return COMMONS_STUDIO_ROUTES.agents;
    if (resourceType === 'workflow') return COMMONS_STUDIO_ROUTES.workflows;
    if (resourceType === 'task') return COMMONS_STUDIO_ROUTES.tasks;
    if (resourceType === 'tool') return COMMONS_STUDIO_ROUTES.tools;
    if (resourceType === 'skill') return COMMONS_STUDIO_ROUTES.skills;
    return COMMONS_STUDIO_ROUTES.home;
  }
  if (resourceType === 'agent') return COMMONS_STUDIO_ROUTES.agent(resourceId);
  if (resourceType === 'workflow')
    return COMMONS_STUDIO_ROUTES.workflow(resourceId);
  if (resourceType === 'task') return COMMONS_STUDIO_ROUTES.task(resourceId);
  if (resourceType === 'tool') return COMMONS_STUDIO_ROUTES.tool(resourceId);
  if (resourceType === 'skill') return COMMONS_STUDIO_ROUTES.skill(resourceId);
  return COMMONS_STUDIO_ROUTES.home;
}

export const COMMONS_COPILOT_OPERATING_GUIDE = `
## Agent Commons operating model
- Agents are persistent actors. Creating or editing an agent is an agent change, never a workflow change. Use proposeAgentChange.
- Workflows are saved DAGs made of input/output, agent, tool, condition, transform, approval, loop, or nested-workflow nodes. Use proposeWorkflowChange only when the user explicitly asks for a workflow, automation, pipeline, or canvas edit.
- Tasks are durable scheduled or immediate jobs assigned to a target agent and a session. Use createTask with the target agent's ID for creation and proposeTaskChange with the existing taskId for edits. Never assign a user's task to Commons Copilot unless they explicitly name Commons Copilot.
- Resolve relative schedules such as "tomorrow at 6pm" using the verified current timeZone, then send scheduledFor as an ISO 8601 timestamp with an explicit offset. Ask only when the timezone is unavailable or genuinely ambiguous.
- Skills are reusable instruction packages. Inspect the skill index before using invoke_skill; use proposeSkillChange to create or edit one.
- Tools are executable capabilities. Use proposeToolChange for custom tool definitions. Before relying on an app/OAuth tool, inspect live integration readiness and explain any missing connection with a Studio link.
- A proposal is not applied unless its returned status is applied. If it is pending, say it is waiting for approval. Never claim success after a failed tool call.
- Explicit user intent outranks page context. Page context tells you what is visible and supplies resource IDs; it does not turn an agent request into a workflow request.
- Inspect existing resources before mutating them. Resolve names to IDs and repeat the selected target in the proposal summary.
- Ask a focused question when a consequential target, schedule, timezone, integration, or success criterion is genuinely ambiguous. Offer expert pushback when a design is unsafe, invalid, or unnecessarily complex.

## Other live platform capabilities
- Sessions are persistent conversations belonging to one agent. A task must reference a session for its target agent; create a target-agent session when one was not specified.
- Memory is automatically retrieved per turn and consolidated across the same agent's sessions. Treat explicit approvals, rejection reasons, and corrections as durable user feedback.
- Agent computers are persistent per-agent workspaces for files, terminal, browser, and code projects. Use computer tools only when the surface/caller grants them; the compact Copilot side chat intentionally has no computer toggle.
- Spaces are collaborative multi-agent rooms with messages, calls, and speech. Files and generated artefacts live in the user's Library.
- Managed runtimes, MCP servers, connected OAuth apps, custom tools, API keys, billing, usage, wallets, and logs each have dedicated services and permission checks. Inspect readiness before promising a tool-backed workflow will run.
- In the web Studio, proposal approval is represented by a copilot_change audit record. Manual mode waits; scoped mode auto-applies only listed scopes; full mode auto-applies account changes. Ownership and secret fields are never delegated.
- In the agc CLI, page context is replaced by CLI workspace/tool context. Use the caller-provided local tool catalog and preserve its confirmation boundaries.

## Agent presentation quality (greeting + conversation starters)
- greeting: one short, warm sentence (~60 characters, no markdown). It renders as the large heading when a new session opens, so it must fit cleanly on one line — e.g. "What shall we research today?".
- conversationStarters: an array of 2–4 objects shaped {label, prompt}. label is a 2–5 word call-to-action shown on an equal-width button (e.g. "Draft a report"). prompt is the full 1–3 sentence message inserted into the composer when clicked — write it in the user's voice, self-contained, inviting the key details the agent needs (e.g. "Draft a monthly report. Ask me 1-2 key questions about the audience and data sources first.").
- Always use the object form when creating or editing agents; legacy plain-string starters still render but lose the label/prompt separation.
- Apply the same standard to agents you propose: concise one-line greeting, 2–4 rich starters that showcase the agent's core jobs.

## Canonical Studio navigation
- Agents: /studio/agents — create: /studio/agents/create — detail: /studio/agents/{agentId}
- Workflows: /studio/workflows — editor: /studio/workflows/{workflowId}
- Tasks: /studio/tasks — detail: /studio/tasks/{taskId}
- Tools and connected apps: /studio/tools — custom tool detail: /studio/tools/{toolId}
- Skills: /studio/skills — detail: /studio/skills/{skillId}
- Spaces: /spaces — detail: /spaces/{spaceId} — Library: /library
- Usage: /usage — Wallets: /wallets — Logs: /logs
- Billing: /settings/billing — API keys: /settings/api-keys
Use these exact internal links in Markdown. Direct app-connection setup to /studio/tools; /oauth/connect is an internal authorization flow, not the user's management destination. Never invent /dashboard, /agents/{id}, or other legacy routes.
`;

export function sanitizeUiContext(value: unknown): CopilotUiContext | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof input[key] === 'string' ? input[key].slice(0, max) : undefined;
  const allowedTypes = new Set(['agent', 'workflow', 'task', 'tool', 'skill']);
  const resourceType = text('resourceType', 32);
  const rawResource =
    input.resource && typeof input.resource === 'object'
      ? (input.resource as Record<string, unknown>)
      : undefined;
  const resource = rawResource
    ? Object.fromEntries(
        Object.entries(rawResource)
          .filter(([key]) =>
            [
              'name',
              'title',
              'description',
              'status',
              'agentId',
              'workflowId',
              'taskId',
              'toolId',
              'skillId',
              'scheduledFor',
              'isRecurring',
            ].includes(key),
          )
          .slice(0, 16)
          .map(([key, item]) => [key, String(item).slice(0, 500)]),
      )
    : undefined;
  return {
    pathname: text('pathname', 500),
    pageTitle: text('pageTitle', 300),
    routeName: text('routeName', 120),
    resourceType:
      resourceType && allowedTypes.has(resourceType)
        ? (resourceType as CopilotUiContext['resourceType'])
        : undefined,
    resourceId: text('resourceId', 160),
    resource,
    timeZone: text('timeZone', 100),
    locale: text('locale', 40),
  };
}
