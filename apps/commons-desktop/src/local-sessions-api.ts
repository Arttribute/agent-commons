import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function sessionView(runtime: PrivateLocalRuntime, id: string) {
  const conversation = runtime.state().conversations.find((entry) => entry.id === id);
  if (!conversation) return null;
  return { sessionId: conversation.id, agentId: conversation.agentId, title: conversation.title,
    projectId: conversation.projectId ?? null,
    history: conversation.messages.map((message) => ({
      role: message.role, content: message.content, timestamp: message.createdAt,
      ...(message.attachments?.length ? { metadata: { attachments: message.attachments.map((attachment) => ({ fileId: attachment.id, name: attachment.name, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes })) } } : {}),
    })),
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, tasks: [], childSessions: [], spaces: [] };
}

export function handleLocalSessionsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    if (!parts.length && method === "POST") {
      const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : undefined;
      const conversation = runtime.createConversation(String(body.agentId ?? ""), String(body.title ?? "New chat"), projectId);
      return ok(sessionView(runtime, conversation.id));
    }
    if (parts[0] === "list" && method === "GET") return ok(runtime.state().conversations
      .filter((item) => !url.searchParams.get("agentId") || item.agentId === url.searchParams.get("agentId"))
      .filter((item) => !url.searchParams.get("projectId") || item.projectId === url.searchParams.get("projectId"))
      .map((item) => sessionView(runtime, item.id)));
    if (parts[0] && parts.length === 1 && method === "GET") {
      const session = sessionView(runtime, parts[0]);
      return session ? ok(session) : bad("Local chat not found", 404);
    }
    if (parts[0] && parts.length === 1 && method === "PATCH") {
      if (typeof body.title === "string") runtime.renameConversation(parts[0], body.title);
      if (body.projectId !== undefined) runtime.moveConversationToProject(parts[0], typeof body.projectId === "string" && body.projectId ? body.projectId : null);
      return ok(sessionView(runtime, parts[0]));
    }
    if (parts[0] && parts.length === 1 && method === "DELETE") {
      runtime.deleteConversation(parts[0]);
      return ok({ deleted: true });
    }
    return bad("Unsupported Local chat operation", 404);
  } catch (error) { return bad(error instanceof Error ? error.message : "Local chat operation failed"); }
}
