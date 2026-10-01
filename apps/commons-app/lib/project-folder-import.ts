"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { supportsBrowserFolders } from "@/components/brains/browser-folder";

export type ImportedFolder = {
  name: string;
  knowledgeSpaceIds: string[];
  libraryItemIds: string[];
  /** Human-readable summary, e.g. "12 notes · 4 documents". */
  summary: string;
};

const DOCUMENT_FILE = /\.(?:pdf|docx|pptx|xlsx|csv|txt|json|md|mdx)$/i;
const MAX_DOCUMENTS = 25;
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

async function payload(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || fallback);
  return body?.data;
}

/** True when this environment can pick a folder for a project. */
export function canImportProjectFolder(local: boolean) {
  return local ? Boolean(typeof window !== "undefined" && window.agentCommonsLocal) : true;
}

/**
 * Brings a project folder into Commons.
 *
 * Project folders contribute files to the Library in both modes. Knowledge
 * Spaces are attached separately and keep their own editing semantics.
 */
export async function importProjectFolder(local: boolean): Promise<ImportedFolder | null> {
  if (local) {
    const bridge = window.agentCommonsLocal;
    if (!bridge) throw new Error("The Local desktop workspace is unavailable.");
    const imported = await bridge.importProjectFolder();
    return imported ? { ...imported, knowledgeSpaceIds: [] } : null;
  }

  if (!supportsBrowserFolders()) throw new Error("Choose a folder with the browser folder picker.");

  const handle = await (window as any).showDirectoryPicker({ mode: "read" }).catch((cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "AbortError") return null;
    throw cause;
  });
  if (!handle) return null;
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
  await walk(handle, 0);
  return importProjectFiles(files, String(handle.name || "Project folder"));
}

export async function importProjectFiles(selected: FileList | File[], folderName?: string): Promise<ImportedFolder> {
  const files = Array.from(selected).filter((file) => DOCUMENT_FILE.test(file.name) && file.size > 0 && file.size <= MAX_DOCUMENT_BYTES).slice(0, MAX_DOCUMENTS);
  const name = folderName || files[0]?.webkitRelativePath?.split("/")[0] || "Project folder";
  const libraryItemIds: string[] = [];
  // The Cloud API accepts ten files per request; keep batches bounded.
  for (let start = 0; start < files.length; start += 10) {
    const form = new FormData();
    files.slice(start, start + 10).forEach((file) => form.append("files", file));
    const uploaded = await payload(await desktopApiFetch("/api/files/upload", { method: "POST", body: form }), "Documents could not be uploaded");
    for (const item of Array.isArray(uploaded) ? uploaded : []) {
      const id = item?.fileId ?? item?.itemId;
      if (typeof id === "string") libraryItemIds.push(id);
    }
  }
  return {
    name,
    knowledgeSpaceIds: [],
    libraryItemIds,
    summary: libraryItemIds.length ? `${libraryItemIds.length} documents` : "No supported files found",
  };
}
