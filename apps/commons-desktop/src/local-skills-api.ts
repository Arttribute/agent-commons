import type { LocalSkill } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function skillView(skill: LocalSkill, runtime: PrivateLocalRuntime) {
  const agents = runtime.state().agents;
  return {
    skillId: skill.id, slug: skill.slug, name: skill.name, description: skill.description,
    instructions: skill.instructions, tools: [], triggers: skill.triggers,
    ownerId: runtime.state().account?.userId ?? "local-workspace", ownerType: "user",
    isPublic: false, isActive: true, version: "1.0.0", tags: skill.tags,
    icon: null, usageCount: 0, source: "local", sourceUrl: null,
    createdAt: skill.createdAt, updatedAt: skill.updatedAt,
    assignedAgents: agents.filter((agent) => skill.assignedAgentIds === undefined || skill.assignedAgentIds.includes(agent.id)).map((agent) => ({
      assignmentId: `${skill.id}:${agent.id}`, agentId: agent.id, agentName: agent.name,
      agentAvatar: agent.avatar, isDefault: false, isEnabled: true,
    })),
  };
}

export function handleLocalSkillsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const skills = runtime.state().skills ?? [];
    if (!parts.length) {
      if (method === "GET") return ok(url.searchParams.get("ownerType") === "platform" ? [] : skills.map((skill) => skillView(skill, runtime)));
      if (method === "POST") {
        if (body.isPublic === true) return bad("Local skills stay private to this computer. Turn off Public to save this skill.");
        const state = runtime.saveSkill({
          slug: String(body.slug ?? ""), name: String(body.name ?? ""), description: String(body.description ?? ""),
          instructions: String(body.instructions ?? ""),
          triggers: Array.isArray(body.triggers) ? body.triggers.map(String) : [],
          tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        });
        return ok(skillView(state.skills!.at(-1)!, runtime));
      }
    }
    if (parts[0] === "index" && method === "GET") return ok(skills.map((skill) => ({ skillId: skill.id, slug: skill.slug, name: skill.name, description: skill.description, tags: skill.tags, triggers: skill.triggers })));
    if (parts[0] === "agents" && parts[1] && method === "GET") return ok(skills.map((skill) => ({
      ...skillView(skill, runtime), assigned: skill.assignedAgentIds === undefined || skill.assignedAgentIds.includes(parts[1]),
    })));
    if (parts[0] === "import" && method === "POST") {
      const file = Array.isArray(body.files) ? body.files[0] as { name?: string; bytes?: Uint8Array } | undefined : undefined;
      if (!file?.bytes || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 1_000_000 || !/\.md$/i.test(file.name ?? "")) return bad("Choose a Markdown skill file smaller than 1 MB.");
      const instructions = new TextDecoder().decode(file.bytes);
      const name = (instructions.match(/^#\s+(.+)$/m)?.[1] ?? file.name!.replace(/\.md$/i, "")).trim();
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      const state = runtime.saveSkill({ slug, name, description: `Imported from ${file.name}`, instructions, triggers: [], tags: [] });
      return ok(skillView(state.skills!.at(-1)!, runtime));
    }
    const skill = skills.find((entry) => entry.id === parts[0]);
    if (!skill) return bad("Local skill not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return ok(skillView(skill, runtime));
      if (method === "DELETE") { runtime.deleteSkill(skill.id); return ok({ deleted: true }); }
      if (method === "PATCH" || method === "PUT") {
        const state = runtime.saveSkill({ id: skill.id,
          slug: String(body.slug ?? skill.slug), name: String(body.name ?? skill.name),
          description: String(body.description ?? skill.description), instructions: String(body.instructions ?? skill.instructions),
          triggers: Array.isArray(body.triggers) ? body.triggers.map(String) : skill.triggers,
          tags: Array.isArray(body.tags) ? body.tags.map(String) : skill.tags,
        });
        return ok(skillView(state.skills!.find((entry) => entry.id === skill.id)!, runtime));
      }
    }
    if (parts[1] === "agents" && parts[2] && method === "PUT") {
      const state = runtime.setSkillAgentAvailability(skill.id, parts[2], body.isEnabled !== false);
      return ok(skillView(state.skills!.find((entry) => entry.id === skill.id)!, runtime));
    }
    return bad("Unsupported Local skill operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local skill operation failed");
  }
}
