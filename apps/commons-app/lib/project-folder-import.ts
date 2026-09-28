"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { chooseMarkdownFolder, rememberMarkdownFolder, supportsBrowserFolders } from "@/components/brains/browser-folder";

export type ImportedFolder = {
  name: string;
  knowledgeSpaceIds: string[];
  libraryItemIds: string[];
  /** Human-readable summary, e.g. "12 notes · 4 documents". */
  summary: string;
};

const DOCUMENT_FILE = /\.(?:pdf|docx|pptx|xlsx|csv|txt|json)$/i;
const MAX_DOCUMENTS = 25;
const MAX_DOCUMENT_BYTES = 20_000_000;

async function payload(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || fallback);
  return body?.data;
}

/** True when this environment can pick a folder for a project. */
export function canImportProjectFolder(local: boolean) {
  return local ? Boolean(typeof window !== "undefined" && window.agentCommonsLocal) : typeof window === "undefined" || supportsBrowserFolders();
}

/**
 * Brings a project folder into Commons.
 *
 * Private Local links the folder as a Knowledge Space that stays on this
 * computer and follows edits made in other apps, including PDF and Office
 * files. Cloud imports Markdown notes into a connected Knowledge Space and
 * uploads documents to the Library as project files.
 */
export async function importProjectFolder(local: boolean): Promise<ImportedFolder | null> {
  if (local) {
    const bridge = window.agentCommonsLocal;
    if (!bridge) throw new Error("The Local desktop workspace is unavailable.");
    const [folder] = await bridge.chooseKnowledgeFolders();
    if (!folder) return null;
    const name = folder.split(/[\\/]/).filter(Boolean).at(-1) || "Project folder";
    const space = await payload(await desktopApiFetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, folders: [folder], allAgents: true }),
    }), "Could not link the folder");
    return {
      name,
      knowledgeSpaceIds: [space.spaceId],
      libraryItemIds: [],
      summary: `${space.counts?.documents ?? 0} files · kept in sync`,
    };
  }

  const picked = await chooseMarkdownFolder().catch((cause) => {
    if (cause instanceof DOMException && cause.name === "AbortError") return null;
    throw cause;
  });
  if (!picked) return null;
  const knowledgeSpaceIds: string[] = [];
  if (picked.documents.length) {
    const space = await payload(await desktopApiFetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: picked.name,
        provider: "browser_filesystem",
        providerConfig: { folderName: picked.name },
        allAgents: true,
      }),
    }), "Could not create the Knowledge Space");
    await rememberMarkdownFolder(space.spaceId, picked.handle);
    await payload(await desktopApiFetch(`/api/knowledge/${space.spaceId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: picked.documents, folders: picked.folders }),
    }), "The notes could not be imported");
    knowledgeSpaceIds.push(space.spaceId);
  }

  const files: File[] = [];
  async function walk(directory: any, depth: number) {
    if (depth > 8 || files.length >= MAX_DOCUMENTS) return;
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".") || name === "node_modules") continue;
      if (handle.kind === "directory") await walk(handle, depth + 1);
      else if (DOCUMENT_FILE.test(name)) {
        const file: File = await handle.getFile();
        if (file.size > 0 && file.size <= MAX_DOCUMENT_BYTES) files.push(file);
      }
      if (files.length >= MAX_DOCUMENTS) break;
    }
  }
  await walk(picked.handle, 0);
  const libraryItemIds: string[] = [];
  if (files.length) {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    const uploaded = await payload(await desktopApiFetch("/api/files/upload", { method: "POST", body: form }), "Documents could not be uploaded");
    for (const item of Array.isArray(uploaded) ? uploaded : []) {
      const id = item?.fileId ?? item?.itemId;
      if (typeof id === "string") libraryItemIds.push(id);
    }
  }
  return {
    name: picked.name,
    knowledgeSpaceIds,
    libraryItemIds,
    summary: [
      picked.documents.length ? `${picked.documents.length} notes` : "",
      libraryItemIds.length ? `${libraryItemIds.length} documents` : "",
    ].filter(Boolean).join(" · ") || "No supported files found",
  };
}
