import type { LocalAgent } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function view(agent: LocalAgent, runtime: PrivateLocalRuntime) {
  return { agentId: agent.id, name: agent.name, avatar: agent.avatar,
    description: agent.description, persona: agent.persona, instructions: agent.instructions,
    owner: runtime.state().account?.userId ?? "local-workspace", isDefault: agent.isDefault,
    modelProvider: "ollama", modelId: agent.model || runtime.state().settings.defaultModel,
    runtimeType: "native", runtimeStatus: "running", createdAt: agent.createdAt, updatedAt: agent.updatedAt };
}

export function handleLocalAgentsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const agents = runtime.state().agents;
    if (!parts.length) {
      if (method === "GET") return ok(agents.map((agent) => view(agent, runtime)));
      if (method === "POST") {
        const state = runtime.saveAgent({ name: String(body.name ?? ""), instructions: String(body.instructions ?? ""),
          model: String(body.modelId ?? body.model ?? runtime.state().settings.defaultModel),
          description: typeof body.description === "string" ? body.description : undefined,
          persona: typeof body.persona === "string" ? body.persona : undefined });
        return ok(view(state.agents.at(-1)!, runtime));
      }
    }
    const agent = agents.find((entry) => entry.id === parts[0]);
    if (!agent) return bad("Local agent not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return ok(view(agent, runtime));
      if (method === "DELETE") { runtime.deleteAgent(agent.id); return ok({ deleted: true }); }
      if (method === "PATCH" || method === "PUT") {
        const state = runtime.saveAgent({ id: agent.id,
          name: typeof body.name === "string" ? body.name : agent.name,
          instructions: typeof body.instructions === "string" ? body.instructions : agent.instructions,
          model: typeof body.modelId === "string" ? body.modelId : agent.model,
          description: typeof body.description === "string" ? body.description : agent.description,
          persona: typeof body.persona === "string" ? body.persona : agent.persona,
        });
        return ok(view(state.agents.find((entry) => entry.id === agent.id)!, runtime));
      }
    }
    return bad("Unsupported Local agent operation", 404);
  } catch (error) { return bad(error instanceof Error ? error.message : "Local agent operation failed"); }
}
