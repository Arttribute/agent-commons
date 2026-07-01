import type { Tool } from "@/types/tool";
import type { McpServer } from "@/types/mcp";
import type { OAuthConnection, OAuthProvider } from "@/types/oauth";
import type { Workflow } from "@/types/workflow";

export interface CatalogAgent {
  agentId: string;
  name: string;
  persona?: string;
  description?: string;
  avatar?: string;
  [key: string]: any;
}

export type ToolCatalogCategory =
  | "google_workspace"
  | "oauth"
  | "mcp_api"
  | "system"
  | "custom"
  | "agents"
  | "workflows";

export type ToolConnectionMode =
  | "oauth"
  | "api_key"
  | "mcp"
  | "system"
  | "custom"
  | "agent"
  | "workflow";

export type ToolCatalogStatus =
  | "connected"
  | "available"
  | "needs_configuration"
  | "coming_soon";

export type WorkflowPaletteKind =
  | "tool"
  | "agent_processor"
  | "workflow"
  | "input"
  | "output"
  | "condition"
  | "transform"
  | "loop"
  | "human_approval";

export interface McpServerTemplate {
  connectionType: "stdio" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  requiredEnv?: string[];
}

export interface ToolCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: ToolCatalogCategory;
  categoryLabel: string;
  connectionMode: ToolConnectionMode;
  status: ToolCatalogStatus;
  statusLabel: string;
  actionLabel: string;
  icon: string;
  tags: string[];
  verified?: boolean;
  sourceLabel?: string;
  documentationUrl?: string;
  authProviderKey?: string;
  oauthScopes?: string[];
  connectUrl?: string;
  mcpTemplate?: McpServerTemplate;
  tool?: Tool;
  agent?: CatalogAgent;
  workflow?: Workflow;
  workflowNode?: {
    kind: WorkflowPaletteKind;
    nodeType: WorkflowPaletteKind;
    toolId?: string;
    toolName?: string;
    agentId?: string;
    workflowId?: string;
    schema?: any;
    config?: Record<string, any>;
  };
}

const GOOGLE_PROVIDER_ALIASES = ["google_workspace", "google", "google_oauth"];

function findProvider(
  providers: OAuthProvider[],
  keys: string[],
): OAuthProvider | undefined {
  return providers.find((provider) => keys.includes(provider.providerKey));
}

function hasConnection(
  connections: OAuthConnection[],
  keys: string[],
): boolean {
  return connections.some((connection) => keys.includes(connection.providerKey));
}

function oauthStatus(
  providers: OAuthProvider[],
  connections: OAuthConnection[],
  keys: string[],
) {
  const provider = findProvider(providers, keys);
  const connected = hasConnection(connections, keys);
  if (connected) return "connected" as const;
  if (provider?.isActive || keys.some((key) => key === "google_workspace")) {
    return "available" as const;
  }
  return "needs_configuration" as const;
}

function statusLabel(status: ToolCatalogStatus) {
  switch (status) {
    case "connected":
      return "Connected";
    case "available":
      return "Ready to connect";
    case "needs_configuration":
      return "Needs setup";
    case "coming_soon":
      return "Coming soon";
  }
}

function actionLabel(status: ToolCatalogStatus, mode: ToolConnectionMode) {
  if (status === "connected") return "Manage";
  if (status === "coming_soon") return "Preview";
  if (mode === "mcp" || mode === "api_key") return "Configure";
  if (mode === "system") return "View";
  return "Connect";
}

const googleWorkspaceSeed = [
  {
    id: "google:gmail",
    displayName: "Gmail",
    description: "Search, read, draft, and send email with user-approved scopes.",
    icon: "Mail",
    tags: ["email", "communication", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    docs: "https://developers.google.com/workspace/gmail/api/auth/scopes",
  },
  {
    id: "google:drive",
    displayName: "Google Drive",
    description: "Find, read, create, and update files in Drive.",
    icon: "FolderOpen",
    tags: ["files", "storage", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    docs: "https://developers.google.com/workspace/drive/api/guides/api-specific-auth",
  },
  {
    id: "google:calendar",
    displayName: "Google Calendar",
    description: "Read availability, list events, and schedule meetings.",
    icon: "CalendarDays",
    tags: ["calendar", "scheduling", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    docs: "https://developers.google.com/workspace/calendar/api/auth",
  },
  {
    id: "google:docs",
    displayName: "Google Docs",
    description: "Read, create, and update Docs with narrow file access where possible.",
    icon: "FileText",
    tags: ["documents", "writing", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ],
    docs: "https://developers.google.com/workspace/docs/api/auth",
  },
  {
    id: "google:sheets",
    displayName: "Google Sheets",
    description: "Read and update spreadsheets for analysis and operations.",
    icon: "Table2",
    tags: ["spreadsheets", "data", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
    docs: "https://developers.google.com/workspace/sheets/api/scopes",
  },
  {
    id: "google:slides",
    displayName: "Google Slides",
    description: "Create and update presentations from workflow outputs.",
    icon: "Presentation",
    tags: ["presentations", "content", "oauth"],
    scopes: [
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/drive.file",
    ],
    docs: "https://developers.google.com/workspace/slides/api/scopes",
  },
  {
    id: "google:chat",
    displayName: "Google Chat",
    description: "Read spaces and send team messages through approved Chat scopes.",
    icon: "MessagesSquare",
    tags: ["chat", "team", "oauth"],
    scopes: ["https://www.googleapis.com/auth/chat.messages"],
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "google:people",
    displayName: "Google Contacts",
    description: "Look up people and contact context for communication workflows.",
    icon: "UsersRound",
    tags: ["contacts", "identity", "oauth"],
    scopes: ["https://www.googleapis.com/auth/contacts.readonly"],
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "google:tasks",
    displayName: "Google Tasks",
    description: "Create and update personal task lists from agent work.",
    icon: "ListTodo",
    tags: ["tasks", "productivity", "oauth"],
    scopes: ["https://www.googleapis.com/auth/tasks"],
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "google:forms",
    displayName: "Google Forms",
    description: "Create forms and inspect responses for collection workflows.",
    icon: "ClipboardList",
    tags: ["forms", "collection", "oauth"],
    scopes: ["https://www.googleapis.com/auth/forms.body"],
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
] as const;

const oauthAppSeed = [
  {
    id: "oauth:canva",
    displayName: "Canva",
    description: "Create and manage design assets through Canva Connect APIs.",
    icon: "Palette",
    providerKeys: ["canva"],
    scopes: ["asset:read", "asset:write", "design:content:read"],
    docs: "https://www.canva.dev/docs/connect/authentication/",
    tags: ["design", "content", "oauth"],
  },
  {
    id: "oauth:github",
    displayName: "GitHub",
    description: "Use repository, issue, pull request, and code context from GitHub.",
    icon: "Github",
    providerKeys: ["github"],
    scopes: ["repo", "read:user"],
    docs: "https://github.com/github/github-mcp-server",
    tags: ["code", "devtools", "oauth"],
  },
  {
    id: "oauth:slack",
    displayName: "Slack",
    description: "Search messages, retrieve context, and send workspace updates.",
    icon: "MessageSquare",
    providerKeys: ["slack"],
    scopes: ["search:read", "channels:history", "chat:write"],
    docs: "https://docs.slack.dev/ai/slack-mcp-server",
    tags: ["communication", "team", "oauth"],
  },
] as const;

const mcpSeed = [
  {
    id: "mcp:fetch",
    displayName: "Fetch",
    description: "Fetch web pages and convert them into model-friendly content.",
    icon: "Globe2",
    tags: ["web", "reference", "mcp"],
    docs: "https://github.com/modelcontextprotocol/servers",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
    },
  },
  {
    id: "mcp:filesystem",
    displayName: "Filesystem",
    description: "Read and write files inside explicit allowed directories.",
    icon: "FolderTree",
    tags: ["files", "local", "mcp"],
    docs: "https://github.com/modelcontextprotocol/servers",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "$ALLOWED_DIRECTORY"],
      env: { ALLOWED_DIRECTORY: "" },
      requiredEnv: ["ALLOWED_DIRECTORY"],
    },
  },
  {
    id: "mcp:memory",
    displayName: "Memory",
    description: "Use a knowledge-graph memory server for durable context.",
    icon: "Brain",
    tags: ["memory", "knowledge", "mcp"],
    docs: "https://github.com/modelcontextprotocol/servers",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    },
  },
  {
    id: "mcp:time",
    displayName: "Time",
    description: "Resolve current time and timezone conversions in workflows.",
    icon: "Clock3",
    tags: ["time", "utility", "mcp"],
    docs: "https://github.com/modelcontextprotocol/servers",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-time"],
    },
  },
  {
    id: "mcp:github",
    displayName: "GitHub MCP",
    description: "Official GitHub MCP server for repos, issues, pull requests, and code search.",
    icon: "Github",
    tags: ["code", "devtools", "mcp"],
    docs: "https://github.com/github/github-mcp-server",
    template: {
      connectionType: "stdio",
      command: "github-mcp-server",
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
      requiredEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    },
  },
  {
    id: "mcp:playwright",
    displayName: "Playwright MCP",
    description: "Browser automation using accessibility snapshots instead of screenshots.",
    icon: "PanelTopOpen",
    tags: ["browser", "automation", "mcp"],
    docs: "https://playwright.dev/docs/getting-started-mcp",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    },
  },
  {
    id: "mcp:notion",
    displayName: "Notion MCP",
    description: "Hosted Notion MCP server with OAuth-based workspace access.",
    icon: "BookOpenText",
    tags: ["docs", "knowledge", "mcp"],
    docs: "https://developers.notion.com/guides/mcp/overview",
    template: {
      connectionType: "sse",
      url: "https://mcp.notion.com/mcp",
    },
  },
  {
    id: "mcp:postgres",
    displayName: "PostgreSQL",
    description: "Inspect schemas and query Postgres data from governed workflows.",
    icon: "Database",
    tags: ["database", "sql", "mcp"],
    docs: "https://modelcontextprotocol.io/examples",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "$DATABASE_URL"],
      env: { DATABASE_URL: "" },
      requiredEnv: ["DATABASE_URL"],
    },
  },
  {
    id: "mcp:linear",
    displayName: "Linear",
    description: "Create, update, and search issues for product workflows.",
    icon: "ListChecks",
    tags: ["issues", "product", "mcp"],
    docs: "https://mcpservers.org/servers/iamadk/reference-servers",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "linear-mcp"],
      env: { LINEAR_API_KEY: "" },
      requiredEnv: ["LINEAR_API_KEY"],
    },
  },
  {
    id: "mcp:stripe",
    displayName: "Stripe",
    description: "Connect payment and billing operations through API-backed tools.",
    icon: "CreditCard",
    tags: ["payments", "billing", "api"],
    docs: "https://docs.stripe.com/api",
    template: {
      connectionType: "stdio",
      command: "npx",
      args: ["-y", "stripe-mcp"],
      env: { STRIPE_SECRET_KEY: "" },
      requiredEnv: ["STRIPE_SECRET_KEY"],
    },
  },
] as const;

export function buildToolCatalog(params: {
  providers: OAuthProvider[];
  connections: OAuthConnection[];
  staticTools: Tool[];
  userTools: Tool[];
  mcpServers: McpServer[];
  agents: CatalogAgent[];
  workflows: Workflow[];
}): ToolCatalogItem[] {
  const {
    providers,
    connections,
    staticTools,
    userTools,
    mcpServers,
    agents,
    workflows,
  } = params;

  const googleProvider = findProvider(providers, GOOGLE_PROVIDER_ALIASES);
  const googleProviderKey = googleProvider?.providerKey ?? "google_workspace";

  const googleItems = googleWorkspaceSeed.map((item) => {
    const status = oauthStatus(providers, connections, GOOGLE_PROVIDER_ALIASES);
    const connectUrl = `/oauth/connect?provider=${encodeURIComponent(
      googleProviderKey,
    )}&scopes=${encodeURIComponent(item.scopes.join(" "))}&label=${encodeURIComponent(
      item.displayName,
    )}&returnUrl=${encodeURIComponent("/studio/tools")}`;

    return {
      id: item.id,
      name: item.displayName,
      displayName: item.displayName,
      description: item.description,
      category: "google_workspace" as const,
      categoryLabel: "Google Workspace",
      connectionMode: "oauth" as const,
      status,
      statusLabel: statusLabel(status),
      actionLabel: actionLabel(status, "oauth"),
      icon: item.icon,
      tags: [...item.tags],
      verified: true,
      sourceLabel: "Google Workspace",
      documentationUrl: item.docs,
      authProviderKey: googleProviderKey,
      oauthScopes: [...item.scopes],
      connectUrl,
    };
  });

  const oauthItems = oauthAppSeed.map((item) => {
    const status = oauthStatus(providers, connections, [...item.providerKeys]);
    const providerKey = findProvider(providers, [...item.providerKeys])?.providerKey ?? item.providerKeys[0];
    const connectUrl = `/oauth/connect?provider=${encodeURIComponent(
      providerKey,
    )}&scopes=${encodeURIComponent(item.scopes.join(" "))}&label=${encodeURIComponent(
      item.displayName,
    )}&returnUrl=${encodeURIComponent("/studio/tools")}`;

    return {
      id: item.id,
      name: item.displayName,
      displayName: item.displayName,
      description: item.description,
      category: "oauth" as const,
      categoryLabel: "OAuth Applications",
      connectionMode: "oauth" as const,
      status,
      statusLabel: statusLabel(status),
      actionLabel: actionLabel(status, "oauth"),
      icon: item.icon,
      tags: [...item.tags],
      verified: true,
      sourceLabel: "OAuth",
      documentationUrl: item.docs,
      authProviderKey: providerKey,
      oauthScopes: [...item.scopes],
      connectUrl,
    };
  });

  const mcpItems = mcpSeed.map((item) => {
    const connected = mcpServers.some((server) =>
      server.name.toLowerCase().includes(item.displayName.toLowerCase().split(" ")[0]),
    );
    const status: ToolCatalogStatus = connected ? "connected" : "available";
    return {
      id: item.id,
      name: item.displayName,
      displayName: item.displayName,
      description: item.description,
      category: "mcp_api" as const,
      categoryLabel: "MCP/API Integrations",
      connectionMode: "mcp" as const,
      status,
      statusLabel: statusLabel(status),
      actionLabel: actionLabel(status, "mcp"),
      icon: item.icon,
      tags: [...item.tags],
      verified: true,
      sourceLabel: "MCP",
      documentationUrl: item.docs,
      mcpTemplate: {
        ...(item.template as McpServerTemplate),
        args: (item.template as McpServerTemplate).args
          ? [...((item.template as McpServerTemplate).args ?? [])]
          : undefined,
        env: (item.template as McpServerTemplate).env
          ? { ...((item.template as McpServerTemplate).env ?? {}) }
          : undefined,
        requiredEnv: (item.template as McpServerTemplate).requiredEnv
          ? [...((item.template as McpServerTemplate).requiredEnv ?? [])]
          : undefined,
      },
    };
  });

  const systemItems = staticTools.map((tool) => ({
    id: `system:${tool.toolId}`,
    name: tool.name,
    displayName: tool.displayName || tool.name,
    description: tool.description || "Platform-supported capability available to agents.",
    category: "system" as const,
    categoryLabel: "Platform Tools",
    connectionMode: "system" as const,
    status: "connected" as const,
    statusLabel: "Built in",
    actionLabel: "View",
    icon: tool.name.toLowerCase().includes("search") ? "Search" : "Wrench",
    tags: tool.tags?.length ? tool.tags : ["platform", "system"],
    verified: true,
    sourceLabel: "Agent Commons",
    tool,
    workflowNode: {
      kind: "tool" as const,
      nodeType: "tool" as const,
      toolId: tool.toolId,
      toolName: tool.name,
      schema: tool.schema,
    },
  }));

  const customItems = userTools.map((tool) => ({
    id: `custom:${tool.toolId}`,
    name: tool.name,
    displayName: tool.displayName || tool.name,
    description: tool.description || "Custom tool created in your workspace.",
    category: "custom" as const,
    categoryLabel: "Custom Tools",
    connectionMode: "custom" as const,
    status: "connected" as const,
    statusLabel: tool.visibility || "Private",
    actionLabel: "Open",
    icon: "PlugZap",
    tags: tool.tags?.length ? tool.tags : ["custom"],
    sourceLabel: "Custom",
    tool,
    workflowNode: {
      kind: "tool" as const,
      nodeType: "tool" as const,
      toolId: tool.toolId,
      toolName: tool.name,
      schema: tool.schema,
    },
  }));

  const agentItems = agents.map((agent) => ({
    id: `agent:${agent.agentId}`,
    name: agent.name,
    displayName: agent.name,
    description: agent.description || agent.persona || "Use this agent as a reasoning step in a workflow.",
    category: "agents" as const,
    categoryLabel: "Agent Processors",
    connectionMode: "agent" as const,
    status: "connected" as const,
    statusLabel: "Available",
    actionLabel: "Use in workflow",
    icon: "Bot",
    tags: ["agent", "workflow"],
    sourceLabel: "Your agents",
    agent,
    workflowNode: {
      kind: "agent_processor" as const,
      nodeType: "agent_processor" as const,
      agentId: agent.agentId,
      config: {
        agentId: agent.agentId,
        prompt: "Process the provided workflow data and return a concise structured result.",
      },
    },
  }));

  const workflowItems = workflows.map((workflow) => ({
    id: `workflow:${workflow.workflowId}`,
    name: workflow.name,
    displayName: workflow.name,
    description: workflow.description || "Reusable workflow that can run as a composed workflow node.",
    category: "workflows" as const,
    categoryLabel: "Workflow Invocations",
    connectionMode: "workflow" as const,
    status: "connected" as const,
    statusLabel: workflow.isActive ? "Active" : "Draft",
    actionLabel: "Use in workflow",
    icon: "Workflow",
    tags: workflow.tags?.length ? workflow.tags : ["workflow"],
    sourceLabel: "Your workflows",
    workflow,
    workflowNode: {
      kind: "workflow" as const,
      nodeType: "workflow" as const,
      workflowId: workflow.workflowId,
      config: { workflowId: workflow.workflowId },
    },
  }));

  return [
    ...googleItems,
    ...oauthItems,
    ...mcpItems,
    ...systemItems,
    ...customItems,
    ...agentItems,
    ...workflowItems,
  ];
}
