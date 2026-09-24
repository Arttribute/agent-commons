import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { LocalLibraryItem } from "@agent-commons/desktop-contract";
import type { PrivateLocalRuntime } from "./runtime";
import type { LocalApiResult } from "./local-knowledge-api";

const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });

function kind(item: LocalLibraryItem) {
  if (item.mimeType.startsWith("image/")) return "image";
  if (item.mimeType.startsWith("video/") || item.mimeType.startsWith("audio/")) return "media";
  if (item.mimeType === "application/pdf") return "pdf";
  if (item.mimeType.startsWith("text/") || /\.(?:md|txt|json|tsx?|jsx?|py|html|css)$/i.test(item.name)) return "text";
  return "document";
}

function view(item: LocalLibraryItem, runtime: PrivateLocalRuntime) {
  const session = runtime.state().conversations.find((entry) => entry.id === item.conversationId);
  const size = existsSync(item.path) ? statSync(item.path).size : 0;
  const text = item.mimeType.startsWith("text/") && size < 1_000_000 && existsSync(item.path)
    ? readFileSync(item.path, "utf8").slice(0, 500) : null;
  const previewUrl = item.mimeType.startsWith("image/") && size < 2_000_000 && existsSync(item.path)
    ? `data:${item.mimeType};base64,${readFileSync(item.path).toString("base64")}` : null;
  return {
    itemId: item.id, name: item.name, description: null, kind: kind(item), mimeType: item.mimeType,
    sizeBytes: size, source: item.source, status: existsSync(item.path) ? "ready" : "missing",
    visibility: "private", sourceAgentId: item.agentId ?? null, sourceSessionId: item.conversationId ?? null,
    sessionTitle: session?.title ?? null, textPreview: text, previewUrl,
    metadata: { localPath: item.path }, isFavorite: Boolean(item.isFavorite),
    createdAt: item.createdAt, updatedAt: item.updatedAt,
  };
}

export function handleLocalLibraryApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Record<string, unknown>): LocalApiResult {
  try {
    if (url.pathname === "/api/files/upload" && method === "POST") {
      const files = Array.isArray(body.files) ? body.files : [];
      const imported = runtime.importLibraryFiles(files as Array<{ name: string; mimeType: string; bytes: Uint8Array }>);
      return ok(imported.map((item) => view(item, runtime)));
    }
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    const items = runtime.state().library ?? [];
    if (parts.length === 0) {
      if (method !== "GET") return bad("Unsupported Local Library operation", 405);
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const viewFilter = url.searchParams.get("view") ?? "all";
      const source = url.searchParams.get("source") ?? "all";
      const agentId = url.searchParams.get("agentId");
      return ok(items.filter((item) => {
        if (query && !item.name.toLowerCase().includes(query)) return false;
        if (source !== "all" && item.source !== source) return false;
        if (agentId && item.agentId !== agentId) return false;
        if (url.searchParams.get("favorite") === "true" && !item.isFavorite) return false;
        if (viewFilter === "images" && kind(item) !== "image") return false;
        if (viewFilter === "documents" && !["text", "document", "pdf"].includes(kind(item))) return false;
        if (viewFilter === "media" && kind(item) !== "media") return false;
        if (viewFilter === "apps") return false;
        return true;
      }).map((item) => view(item, runtime)));
    }
    const item = items.find((entry) => entry.id === parts[0]);
    if (!item) return bad("Local artifact not found", 404);
    if (parts.length === 1) {
      if (method === "GET") return { status: 200, body: { ...view(item, runtime), grants: [], blobs: [{ storageProvider: "local" }] } };
      if (method === "PATCH") {
        runtime.updateLibraryItem(item.id, { name: typeof body.name === "string" ? body.name : undefined, isFavorite: typeof body.isFavorite === "boolean" ? body.isFavorite : undefined });
        return ok(view(runtime.state().library!.find((entry) => entry.id === item.id)!, runtime));
      }
      if (method === "DELETE") { runtime.deleteLibraryItem(item.id); return ok({ deleted: true }); }
    }
    if (!existsSync(item.path)) return bad("The Local file is missing from disk", 404);
    const stats = statSync(item.path);
    const inline = stats.size <= 5_000_000 ? `data:${item.mimeType};base64,${readFileSync(item.path).toString("base64")}` : undefined;
    if (parts[1] === "preview" && method === "GET") return ok({
      ...view(item, runtime), content: item.mimeType.startsWith("text/") && stats.size <= 2_000_000 ? readFileSync(item.path, "utf8") : undefined,
      totalChars: item.mimeType.startsWith("text/") ? stats.size : undefined,
      truncated: false, artifacts: [],
      download: inline ? { itemId: item.id, name: item.name, mimeType: item.mimeType, url: inline, expiresInSeconds: 0 } : undefined,
      inline: inline ? { itemId: item.id, name: item.name, mimeType: item.mimeType, url: inline, expiresInSeconds: 0 } : undefined,
    });
    if (parts[1] === "download" && method === "GET") return ok({ url: inline ?? "", localPath: item.path });
    if (parts[1] === "provenance" && method === "GET") {
      const hash = createHash("sha256").update(readFileSync(item.path)).digest("hex");
      return ok({
        context: "Agent Commons Local", resource: { itemId: item.id, name: item.name, kind: kind(item), mimeType: item.mimeType, sizeBytes: stats.size, createdAt: item.createdAt, createdBy: item.agentId ?? "local-user", address: { scheme: "local-file", ref: item.path } },
        capture: { mode: "local", linkage: "local-file", traceCount: 0, eventCount: 1, droppedEvents: 0 },
        entities: item.agentId ? [{ id: item.agentId, role: "ai", name: runtime.state().agents.find((agent) => agent.id === item.agentId)?.name }] : [],
        runs: [], actions: [], derivation: { source: null, revisions: [] },
        governance: { license: null, aiTraining: null, authorization: { visibility: "private", sharing: "none", grantCount: 0, shareCount: 0 } },
        integrity: { algorithm: "sha256", contentHash: hash, verified: true, bundleHashes: [], anchors: [] },
        history: [{ eventId: item.id, action: item.source === "upload" ? "uploaded" : "created", actorType: item.agentId ? "agent" : "user", actorId: item.agentId ?? "local-user", createdAt: item.createdAt, contentHash: hash }],
        disclosure: { eventsIncluded: true, eventsReturned: 1, eventsTruncated: false, privateReasoningIncluded: false, credentialsIncluded: false },
      });
    }
    return bad("Unsupported Local Library operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Local Library operation failed");
  }
}
