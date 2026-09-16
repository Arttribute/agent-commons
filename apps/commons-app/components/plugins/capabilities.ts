/**
 * Mirror of apps/commons-api/src/ui-plugin/ui-plugin.capabilities.ts.
 * The API is authoritative and re-checks every grant; this copy lets the host
 * preflight requests and render the permission UI without a round trip.
 * capabilities.test.mjs fails if the two catalogs drift.
 */

export type UiPluginCapabilityAccess = "read" | "write" | "external";

export type UiPluginCapabilityDefinition = {
  label: string;
  description: string;
  group: "workspace" | "agents" | "data" | "network" | "assistant";
  access: UiPluginCapabilityAccess;
  methods: readonly string[];
  resource?:
    | "agent"
    | "task"
    | "workflow"
    | "library"
    | "tool"
    | "session"
    | "skill"
    | "space"
    | "connection"
    | "collection";
  gateway?: boolean;
};

export const UI_PLUGIN_CAPABILITIES = {
  "agents.read": {
    label: "Read agents",
    description: "List your agents, their models and status.",
    group: "agents",
    access: "read",
    methods: ["agents.list"],
    resource: "agent",
  },
  "agents.run": {
    label: "Message agents",
    description:
      "Send a prompt to one of your agents and read its reply. Uses credits.",
    group: "agents",
    access: "write",
    methods: ["agents.run"],
    resource: "agent",
    gateway: true,
  },
  "sessions.read": {
    label: "Read chat sessions",
    description: "List chat sessions and read their messages.",
    group: "agents",
    access: "read",
    methods: ["sessions.list", "sessions.get"],
    resource: "session",
    gateway: true,
  },
  "memory.read": {
    label: "Read agent memory",
    description: "Read what your agents remember.",
    group: "agents",
    access: "read",
    methods: ["memory.list"],
    resource: "agent",
    gateway: true,
  },
  "memory.write": {
    label: "Add agent memory",
    description: "Save new memories to your agents.",
    group: "agents",
    access: "write",
    methods: ["memory.create"],
    resource: "agent",
    gateway: true,
  },
  "skills.read": {
    label: "Read skills",
    description: "List the skills available in your workspace.",
    group: "agents",
    access: "read",
    methods: ["skills.list"],
    resource: "skill",
    gateway: true,
  },
  "tasks.read": {
    label: "Read tasks",
    description: "List tasks and their progress.",
    group: "workspace",
    access: "read",
    methods: ["tasks.list"],
    resource: "task",
  },
  "tasks.write": {
    label: "Create and edit tasks",
    description: "Create new tasks and edit existing ones.",
    group: "workspace",
    access: "write",
    methods: ["tasks.create", "tasks.update"],
    resource: "task",
  },
  "workflows.read": {
    label: "Read workflows",
    description: "List your workflows.",
    group: "workspace",
    access: "read",
    methods: ["workflows.list"],
    resource: "workflow",
  },
  "workflows.execute": {
    label: "Run workflows",
    description: "Start workflow runs.",
    group: "workspace",
    access: "write",
    methods: ["workflows.execute"],
    resource: "workflow",
  },
  "library.read": {
    label: "Read library",
    description: "List files and artifacts in your library.",
    group: "workspace",
    access: "read",
    methods: ["library.list"],
    resource: "library",
  },
  "tools.read": {
    label: "Read tools",
    description: "List the tools available to your agents.",
    group: "workspace",
    access: "read",
    methods: ["tools.list"],
    resource: "tool",
  },
  "spaces.read": {
    label: "Read spaces",
    description: "List the spaces you belong to.",
    group: "workspace",
    access: "read",
    methods: ["spaces.list"],
    resource: "space",
    gateway: true,
  },
  "credits.read": {
    label: "Read credit balance",
    description: "See your available credits.",
    group: "workspace",
    access: "read",
    methods: ["credits.get"],
    gateway: true,
  },
  "data.read": {
    label: "Read app data",
    description: "Read records from this app's own storage.",
    group: "data",
    access: "read",
    methods: ["data.get", "data.query", "data.collections"],
    resource: "collection",
    gateway: true,
  },
  "data.write": {
    label: "Write app data",
    description: "Create, update and delete records in this app's storage.",
    group: "data",
    access: "write",
    methods: ["data.insert", "data.update", "data.delete"],
    resource: "collection",
    gateway: true,
  },
  "network.request": {
    label: "Call external services",
    description:
      "Call the external APIs you connect. Your keys stay on Commons servers.",
    group: "network",
    access: "external",
    methods: ["http.request"],
    resource: "connection",
    gateway: true,
  },
  "copilot.prompt": {
    label: "Draft Copilot prompts",
    description: "Put a prompt in the Copilot composer for you to review.",
    group: "assistant",
    access: "write",
    methods: ["copilot.open"],
  },
} as const satisfies Record<string, UiPluginCapabilityDefinition>;

export type UiPluginCapabilityName = keyof typeof UI_PLUGIN_CAPABILITIES;

export const UI_PLUGIN_CAPABILITY_NAMES = Object.keys(
  UI_PLUGIN_CAPABILITIES,
) as UiPluginCapabilityName[];

export const UI_PLUGIN_METHOD_CAPABILITIES: Record<
  string,
  UiPluginCapabilityName
> = Object.fromEntries(
  UI_PLUGIN_CAPABILITY_NAMES.flatMap((name) =>
    UI_PLUGIN_CAPABILITIES[name].methods.map((method) => [method, name]),
  ),
);

export const UI_PLUGIN_GATEWAY_METHODS: ReadonlySet<string> = new Set<string>(
  UI_PLUGIN_CAPABILITY_NAMES.filter(
    (name) =>
      (UI_PLUGIN_CAPABILITIES[name] as UiPluginCapabilityDefinition).gateway,
  ).flatMap((name) => UI_PLUGIN_CAPABILITIES[name].methods),
);

export const CAPABILITY_GROUP_LABELS: Record<
  UiPluginCapabilityDefinition["group"],
  string
> = {
  agents: "Agents",
  workspace: "Workspace",
  data: "App data",
  network: "External services",
  assistant: "Copilot",
};

export function isUiPluginCapabilityName(
  value: unknown,
): value is UiPluginCapabilityName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(UI_PLUGIN_CAPABILITIES, value)
  );
}

export function defaultApproval(name: UiPluginCapabilityName) {
  return UI_PLUGIN_CAPABILITIES[name].access === "read" || name === "data.write"
    ? ("auto" as const)
    : ("ask" as const);
}
