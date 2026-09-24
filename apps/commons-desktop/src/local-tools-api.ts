import { LOCAL_TOOLS, type PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

/** Catalog of the tools that Local agents can actually call. */
export function handleLocalToolsApi(runtime: PrivateLocalRuntime, url: URL, method: string): LocalApiResult {
  if (url.pathname !== "/api/tools/catalog" || method !== "GET") {
    return { status: 404, body: { message: "Local tool operation not found" } };
  }
  const hasSkills = Boolean(runtime.state().skills?.length);
  const builtInItems = LOCAL_TOOLS
    .filter((entry) => entry.function.name !== "invoke_skill" || hasSkills)
    .map((entry) => {
      const name = entry.function.name;
      const displayName = name.replace(/^(?:cli|local)_/, "").split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
      const group = name.startsWith("cli_") ? "Computer" : name.includes("knowledge") || name.includes("note") ? "Knowledge" : name.includes("skill") ? "Skills" : "Local data";
      return {
        id: `local:${name}`, name, displayName, description: entry.function.description,
        category: "system", categoryLabel: "Local tools", connectionMode: "system",
        status: "connected", statusLabel: "Built in", actionLabel: "Available",
        icon: name.includes("search") ? "Search" : name.includes("file") || name.includes("note") ? "FileText" : "Wrench",
        tags: ["local", group.toLowerCase()], verified: true, sourceLabel: "Private Local",
      };
    });
  const agentItems = runtime.state().agents.map((agent) => ({
    id: `agent:${agent.id}`, name: agent.name, displayName: agent.name,
    description: agent.description || agent.persona || "Use this Local agent as a reasoning step in a workflow.",
    category: "agents", categoryLabel: "Agent Processors", connectionMode: "agent",
    status: "connected", statusLabel: "Available", actionLabel: "Use in workflow",
    icon: "Bot", tags: ["agent", "workflow", "local"], sourceLabel: "Local agents",
    agent: { agentId: agent.id, name: agent.name, avatar: agent.avatar },
    workflowNode: {
      kind: "agent_processor", nodeType: "agent_processor", agentId: agent.id,
      config: { agentId: agent.id, prompt: "Process the provided workflow data and return a concise result." },
    },
  }));
  const items = [...builtInItems, ...agentItems];
  return { status: 200, body: { items, total: items.length, meta: { mode: "private-local", generatedAt: new Date().toISOString() } } };
}
