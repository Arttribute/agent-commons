import type { LocalProject } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined;

/** Same shape as the Cloud projects API so one UI serves both modes. */
export function projectView(project: LocalProject, runtime: PrivateLocalRuntime) {
  const state = runtime.state();
  const conversations = state.conversations.filter((conversation) => conversation.projectId === project.id);
  return {
    projectId: project.id,
    name: project.name,
    description: project.description ?? null,
    instructions: project.instructions ?? null,
    agentId: project.agentId ?? null,
    knowledgeSpaceIds: project.spaceIds,
    libraryItemIds: project.libraryItemIds,
    pinned: Boolean(project.pinned),
    location: "local",
    knowledgeSpaces: state.spaces.filter((space) => project.spaceIds.includes(space.id)).map((space) => ({
      spaceId: space.id, name: space.name, documents: space.files.length,
      linkedFolder: space.linked ? space.folders[0] : undefined,
      git: space.source?.git ? { branch: space.source.git.branch, commit: space.source.git.commit } : undefined,
    })),
    files: (state.library ?? []).filter((item) => project.libraryItemIds.includes(item.id)).map((item) => ({
      itemId: item.id, name: item.name, mimeType: item.mimeType, keepOnDevice: Boolean(item.keepOnDevice), inCloud: Boolean(item.cloudItemId),
    })),
    tasks: state.tasks.filter((task) => task.sessionId && conversations.some((conversation) => conversation.id === task.sessionId)).map((task) => ({
      taskId: task.id, title: task.title, status: task.status, dueAt: task.dueAt ?? null,
    })),
    sessionCount: conversations.length,
    lastActivityAt: conversations.map((conversation) => conversation.updatedAt).sort().at(-1) ?? project.updatedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function handleLocalProjectsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const projects = runtime.state().projects ?? [];
    if (!parts.length) {
      if (method === "GET") {
        return ok([...projects]
          .map((project) => projectView(project, runtime))
          .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastActivityAt.localeCompare(left.lastActivityAt)));
      }
      if (method === "POST") {
        const project = runtime.saveProject({
          name: String(body.name ?? ""),
          description: typeof body.description === "string" ? body.description : undefined,
          instructions: typeof body.instructions === "string" ? body.instructions : undefined,
          spaceIds: strings(body.knowledgeSpaceIds),
          libraryItemIds: strings(body.libraryItemIds),
          agentId: typeof body.agentId === "string" ? body.agentId : undefined,
        });
        return ok(projectView(project, runtime));
      }
    }
    const project = projects.find((entry) => entry.id === parts[0]);
    if (!project) return bad("Project not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return ok(projectView(project, runtime));
      if (method === "PATCH") {
        const saved = runtime.saveProject({
          id: project.id,
          name: typeof body.name === "string" ? body.name : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          instructions: typeof body.instructions === "string" ? body.instructions : undefined,
          spaceIds: strings(body.knowledgeSpaceIds),
          libraryItemIds: strings(body.libraryItemIds),
          agentId: body.agentId === null ? null : typeof body.agentId === "string" ? body.agentId : undefined,
          pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
        });
        return ok(projectView(saved, runtime));
      }
      if (method === "DELETE") {
        runtime.deleteProject(project.id);
        return ok({ deleted: true });
      }
    }
    if (parts[1] === "sessions" && method === "GET") {
      return ok(runtime.state().conversations
        .filter((conversation) => conversation.projectId === project.id)
        .map((conversation) => ({
          sessionId: conversation.id, agentId: conversation.agentId, title: conversation.title,
          projectId: project.id, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt,
        })));
    }
    return bad("Unsupported Local project operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local project operation failed");
  }
}
