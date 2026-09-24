import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function sessionView(runtime: PrivateLocalRuntime, id: string) {
  const conversation = runtime.state().conversations.find((entry) => entry.id === id);
  if (!conversation) return null;
  return { sessionId: conversation.id, agentId: conversation.agentId, title: conversation.title,
    history: conversation.messages.map((message) => ({ role: message.role, content: message.content, timestamp: message.createdAt })),
    createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, tasks: [], childSessions: [], spaces: [] };
}

export function handleLocalSessionsApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    if (!parts.length && method === "POST") {
      const conversation = runtime.createConversation(String(body.agentId ?? ""), String(body.title ?? "New chat"));
      return ok(sessionView(runtime, conversation.id));
    }
    if (parts[0] === "list" && method === "GET") return ok(runtime.state().conversations
      .filter((item) => !url.searchParams.get("agentId") || item.agentId === url.searchParams.get("agentId"))
      .map((item) => sessionView(runtime, item.id)));
    if (parts[0] && method === "GET") {
      const session = sessionView(runtime, parts[0]);
      return session ? ok(session) : bad("Local chat not found", 404);
    }
    return bad("Unsupported Local chat operation", 404);
  } catch (error) { return bad(error instanceof Error ? error.message : "Local chat operation failed"); }
}
