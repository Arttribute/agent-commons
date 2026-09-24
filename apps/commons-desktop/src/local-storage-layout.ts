import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LocalState } from "@agent-commons/desktop-contract";

const SECTIONS = ["agents", "conversations", "knowledge", "artifacts", "apps", "skills", "tasks", "workflows", "uploads"] as const;

/** Human-readable local workspace. state.bin remains the transactional index. */
export class LocalStorageLayout {
  readonly root: string;

  constructor(userDataDirectory: string) {
    this.root = join(userDataDirectory, "private-local", "workspace");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    for (const section of SECTIONS) mkdirSync(join(this.root, section), { recursive: true, mode: 0o700 });
    this.write("README.md", [
      "# Agent Commons Local workspace",
      "",
      "Everything in this directory stays on this computer. The desktop app uses ../state.bin as its transactional index, protected by the operating system's secure storage when available.",
      "Knowledge notes and artifact copies live here as normal files. The other folders contain readable records for local agents and people.",
      "Cloud mode cannot select this workspace for computer tools.",
      "",
    ].join("\n"));
  }

  path(section: typeof SECTIONS[number], name = "") {
    return join(this.root, section, name);
  }

  sync(state: LocalState) {
    this.syncJson("agents", state.agents.map((agent) => [agent.id, {
      ...agent,
      // Image bytes are already stored in the encrypted index and are not
      // useful in a text record. Keep a short marker instead.
      avatar: agent.avatar?.startsWith("data:") ? "[embedded local image]" : agent.avatar,
    }]));
    this.syncJson("conversations", state.conversations.map((conversation) => [conversation.id, conversation]));
    this.syncJson("tasks", state.tasks.map((task) => [task.id, task]));
    this.syncJson("workflows", state.workflows.map((workflow) => [workflow.id, workflow]));
    this.syncJson("apps", state.apps.map((app) => [app.id, app]));
    this.syncJson("knowledge", state.spaces.map((space) => [space.id, {
      id: space.id,
      name: space.name,
      folders: space.folders,
      indexedAt: space.indexedAt,
      fileCount: space.files.length,
      autoGrantNewAgents: space.autoGrantNewAgents,
      grants: space.grants,
    }]));
    this.syncJson("artifacts", state.conversations.flatMap((conversation) =>
      (conversation.artifacts ?? []).map((artifact) => [artifact.id, {
        ...artifact,
        conversationId: conversation.id,
        agentId: conversation.agentId,
        sourceWorkspace: conversation.workspaceRoot,
      }] as const)));
    this.write("artifacts/library.json", `${JSON.stringify(state.library ?? [], null, 2)}\n`);
    this.syncMarkdownSkills(state);
  }

  private syncJson(section: Exclude<typeof SECTIONS[number], "skills" | "uploads">, entries: Array<readonly [string, unknown]>) {
    const expected = new Set<string>();
    for (const [id, value] of entries) {
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
      const filename = `${id}.json`;
      expected.add(filename);
      this.write(`${section}/${filename}`, `${JSON.stringify(value, null, 2)}\n`);
    }
    for (const filename of readdirSync(this.path(section))) {
      if (filename.endsWith(".json") && filename !== "library.json" && !expected.has(filename)) unlinkSync(this.path(section, filename));
    }
  }

  private syncMarkdownSkills(state: LocalState) {
    const expected = new Set<string>();
    for (const skill of state.skills ?? []) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.slug)) continue;
      const filename = `${skill.slug}.md`;
      expected.add(filename);
      this.write(`skills/${filename}`, [
        "---",
        `id: ${JSON.stringify(skill.id)}`,
        `name: ${JSON.stringify(skill.name)}`,
        `description: ${JSON.stringify(skill.description)}`,
        `triggers: ${JSON.stringify(skill.triggers)}`,
        `tags: ${JSON.stringify(skill.tags)}`,
        `assignedAgentIds: ${JSON.stringify(skill.assignedAgentIds ?? null)}`,
        "---",
        "",
        skill.instructions,
        "",
      ].join("\n"));
    }
    for (const filename of readdirSync(this.path("skills"))) {
      if (filename.endsWith(".md") && !expected.has(filename)) unlinkSync(this.path("skills", filename));
    }
  }

  private write(relativePath: string, content: string) {
    const destination = join(this.root, relativePath);
    try { if (readFileSync(destination, "utf8") === content) return; } catch { /* New record. */ }
    const temporary = `${destination}.tmp`;
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, destination);
  }
}
