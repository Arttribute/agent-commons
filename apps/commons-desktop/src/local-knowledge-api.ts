import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import type { KnowledgeFile, KnowledgeSpace } from "@agent-commons/desktop-contract";
import { safePath } from "../../../packages/agc-cli/src/local-tools";
import type { PrivateLocalRuntime } from "./runtime";

type Payload = Record<string, unknown>;
export type LocalApiResult = { status: number; body: unknown };
const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });
const idFor = (spaceId: string, path: string) => createHash("sha256").update(`${spaceId}:${path}`).digest("hex").slice(0, 24);

function spaceView(space: KnowledgeSpace, index: number) {
  return {
    spaceId: space.id,
    name: space.name,
    description: null,
    provider: "native",
    permission: "manage",
    color: "#0d9488",
    status: "active",
    isDefault: index === 0,
    autoGrantNewAgents: space.autoGrantNewAgents ?? true,
    autoRetrieve: true,
    grants: (space.grants ?? []).map((grant) => ({ ...grant, grantId: grant.id })),
    counts: { documents: space.files.length, links: 0, folders: listFolders(space).length },
    updatedAt: space.indexedAt ?? new Date().toISOString(),
  };
}

function rootFor(space: KnowledgeSpace) {
  const root = space.folders.find((folder) => existsSync(folder) && statSync(folder).isDirectory());
  if (root) return root;
  const file = space.folders.find((entry) => existsSync(entry) && statSync(entry).isFile());
  if (file) return dirname(file);
  throw new Error("This Knowledge Space has no available folder. Reconnect its source folder.");
}

function relativeFile(space: KnowledgeSpace, file: KnowledgeFile) {
  const root = rootFor(space);
  return relative(root, file.path).replaceAll("\\", "/");
}

function filesFor(space: KnowledgeSpace) {
  return space.files.filter((file) => {
    try { return !relativeFile(space, file).startsWith("../"); } catch { return false; }
  });
}

function listFolders(space: KnowledgeSpace) {
  const root = rootFor(space);
  const output: Array<{ folderId: string; spaceId: string; path: string; createdAt: string; updatedAt: string }> = [];
  function walk(directory: string, depth: number) {
    if (depth > 20) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (!item.isDirectory() || item.isSymbolicLink() || item.name.startsWith(".")) continue;
      const absolute = safePath(root, join(relative(root, directory), item.name));
      const path = relative(root, absolute).replaceAll("\\", "/");
      const stats = statSync(absolute);
      output.push({ folderId: idFor(space.id, path), spaceId: space.id, path, createdAt: stats.birthtime.toISOString(), updatedAt: stats.mtime.toISOString() });
      walk(absolute, depth + 1);
    }
  }
  walk(root, 0);
  return output;
}

function documentView(space: KnowledgeSpace, file: KnowledgeFile, includeContent = false) {
  const path = relativeFile(space, file);
  const stats = statSync(file.path);
  const content = includeContent ? readFileSync(file.path, "utf8") : undefined;
  return {
    documentId: idFor(space.id, path), spaceId: space.id, path,
    title: basename(path, extname(path)), content,
    revision: Math.trunc(stats.mtimeMs), frontmatter: {}, tags: [],
    contentHash: createHash("sha256").update(content ?? file.excerpt).digest("hex"),
    createdAt: stats.birthtime.toISOString(), updatedAt: stats.mtime.toISOString(),
    outgoing: [], backlinks: [],
  };
}

function findDocument(space: KnowledgeSpace, id: string) {
  return filesFor(space).find((file) => idFor(space.id, relativeFile(space, file)) === id);
}

function checkedPath(root: string, value: unknown, extension = false) {
  if (typeof value !== "string" || !value.trim()) throw new Error("A file or folder path is required.");
  const path = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (path === "." || path.startsWith("../") || path.includes("/../")) throw new Error("Invalid Knowledge path.");
  const target = safePath(root, path);
  if (extension && ![".md", ".mdx", ".txt"].includes(extname(target).toLowerCase())) throw new Error("Knowledge notes must use .md, .mdx, or .txt.");
  return target;
}

export async function handleLocalKnowledgeApi(runtime: PrivateLocalRuntime, url: URL, method: string, body: Payload): Promise<LocalApiResult> {
  try {
    const parts = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
    if (parts.length === 0) {
      if (method === "GET") return ok(runtime.state().spaces.map(spaceView));
      if (method === "POST") {
        const name = String(body.name ?? "New Knowledge Space").trim();
        const folders = Array.isArray(body.folders) ? body.folders.filter((folder): folder is string => typeof folder === "string") : [];
        const state = await runtime.addKnowledgeSpace(name, folders);
        return ok(spaceView(state.spaces.at(-1)!, state.spaces.length - 1));
      }
    }
    if (parts[0] === "search" && method === "GET") {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const selected = url.searchParams.getAll("spaceIds");
      const terms = query.match(/[a-z0-9_-]{2,}/g) ?? [];
      const results = runtime.state().spaces
        .filter((space) => !selected.length || selected.includes(space.id))
        .flatMap((space) => filesFor(space).flatMap((file) => {
          const haystack = `${file.path}\n${file.excerpt}`.toLowerCase();
          const score = terms.filter((term) => haystack.includes(term)).length;
          return score ? [{ ...documentView(space, file), spaceName: space.name, excerpt: file.excerpt.slice(0, 400), score, matchedBy: ["content"] }] : [];
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(Number(url.searchParams.get("limit") ?? 8), 50));
      return ok({ results });
    }
    const spaces = runtime.state().spaces;
    const space = spaces.find((item) => item.id === parts[0]);
    if (!space) return bad("Knowledge Space not found", 404);
    const root = rootFor(space);
    if (parts.length === 1) {
      if (method === "GET") return ok(spaceView(space, spaces.indexOf(space)));
      if (method === "PATCH") {
        const state = runtime.updateKnowledgeSpace(space.id, { autoGrantNewAgents: typeof body.autoGrantNewAgents === "boolean" ? body.autoGrantNewAgents : undefined });
        return ok(spaceView(state.spaces.find((item) => item.id === space.id)!, spaces.indexOf(space)));
      }
      if (method === "DELETE") { runtime.removeKnowledgeSpace(space.id); return ok({ deleted: true }); }
    }
    if (parts[1] === "grants") {
      if (method === "POST") {
        const subjectType = String(body.subjectType);
        const permission = String(body.permission);
        if (!["agent", "user", "workspace"].includes(subjectType) || !["read", "write", "manage"].includes(permission) || typeof body.subjectId !== "string") return bad("Invalid Knowledge access grant");
        const state = runtime.saveKnowledgeGrant(space.id, { subjectType: subjectType as "agent" | "user" | "workspace", subjectId: body.subjectId, permission: permission as "read" | "write" | "manage", autoRetrieve: body.autoRetrieve !== false });
        return ok(spaceView(state.spaces.find((item) => item.id === space.id)!, spaces.indexOf(space)));
      }
      if (method === "DELETE" && parts[2]) {
        runtime.removeKnowledgeGrant(space.id, parts[2]);
        return ok({ deleted: true });
      }
    }
    if (parts[1] === "graph" && method === "GET") return ok({ nodes: [], edges: [] });
    if (parts[1] === "documents") {
      if (parts.length === 2) {
        if (method === "GET") return ok(filesFor(space).map((file) => documentView(space, file)));
        if (method === "POST") {
          const path = checkedPath(root, body.path, true);
          if (existsSync(path)) return bad("A note already exists at that path", 409);
          mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
          writeFileSync(path, String(body.content ?? ""), { flag: "wx", mode: 0o600 });
          const state = await runtime.reindexKnowledgeSpace(space.id);
          return ok(documentView(state.spaces.find((item) => item.id === space.id)!, { path, size: statSync(path).size, modifiedAt: new Date().toISOString(), excerpt: String(body.content ?? "") }, true));
        }
      }
      const file = findDocument(space, parts[2]);
      if (!file) return bad("Knowledge note not found", 404);
      if (method === "GET") return ok(documentView(space, file, true));
      if (method === "DELETE") {
        unlinkSync(file.path);
        await runtime.reindexKnowledgeSpace(space.id);
        return ok({ deleted: true });
      }
      if (method === "PATCH") {
        const current = documentView(space, file, true);
        if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== current.revision) return bad("This note changed on disk. Reload it before saving.", 409);
        const target = body.path ? checkedPath(root, body.path, true) : file.path;
        if (target !== file.path && existsSync(target)) return bad("A note already exists at that path", 409);
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        const content = String(body.content ?? current.content ?? "");
        writeFileSync(target, content, { mode: 0o600 });
        if (target !== file.path) unlinkSync(file.path);
        const state = await runtime.reindexKnowledgeSpace(space.id);
        return ok(documentView(state.spaces.find((item) => item.id === space.id)!, { path: target, size: statSync(target).size, modifiedAt: new Date().toISOString(), excerpt: content }, true));
      }
    }
    if (parts[1] === "folders") {
      if (parts.length === 2) {
        if (method === "GET") return ok(listFolders(space));
        if (method === "POST") {
          const path = checkedPath(root, body.path);
          mkdirSync(path, { recursive: true, mode: 0o700 });
          return ok(listFolders(space).find((folder) => folder.path === relative(root, path).replaceAll("\\", "/")));
        }
      }
      const folder = listFolders(space).find((item) => item.folderId === parts[2]);
      if (!folder) return bad("Knowledge folder not found", 404);
      const source = checkedPath(root, folder.path);
      if (method === "PATCH") {
        const target = checkedPath(root, body.path);
        if (existsSync(target)) return bad("A folder already exists at that path", 409);
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        renameSync(source, target);
        await runtime.reindexKnowledgeSpace(space.id);
        return ok(listFolders(space).find((item) => item.path === relative(root, target).replaceAll("\\", "/")));
      }
      if (method === "DELETE") {
        rmSync(source, { recursive: true, force: true });
        await runtime.reindexKnowledgeSpace(space.id);
        return ok({ deleted: true });
      }
    }
    if (parts[1] === "import" && method === "POST") {
      let created = 0;
      let updated = 0;
      for (const folder of Array.isArray(body.folders) ? body.folders : []) {
        if (folder && typeof folder === "object") mkdirSync(checkedPath(root, (folder as Payload).path), { recursive: true, mode: 0o700 });
      }
      for (const document of Array.isArray(body.documents) ? body.documents : []) {
        if (!document || typeof document !== "object") continue;
        const entry = document as Payload;
        const path = checkedPath(root, entry.path, true);
        existsSync(path) ? updated++ : created++;
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, String(entry.content ?? ""), { mode: 0o600 });
      }
      await runtime.reindexKnowledgeSpace(space.id);
      return ok({ created, updated });
    }
    return bad("Unsupported Local Knowledge operation", 404);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Knowledge operation failed");
  }
}
