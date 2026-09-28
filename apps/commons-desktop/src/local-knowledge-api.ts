import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, posix, relative } from "node:path";
import type { KnowledgeFile, KnowledgeSpace } from "@agent-commons/desktop-contract";
import { safePath } from "../../../packages/agc-cli/src/local-tools";
import { extractLinks, extractTags, searchChunks } from "./knowledge";
import type { PrivateLocalRuntime } from "./runtime";

type Payload = Record<string, unknown>;
export type LocalApiResult = { status: number; body: unknown };
const ok = (data: unknown): LocalApiResult => ({ status: 200, body: { data } });
const bad = (message: string, status = 400): LocalApiResult => ({ status, body: { message } });
const idFor = (spaceId: string, path: string) => createHash("sha256").update(`${spaceId}:${path}`).digest("hex").slice(0, 24);

function spaceView(space: KnowledgeSpace, index: number) {
  const graph = safeGraph(space);
  return {
    spaceId: space.id,
    name: space.name,
    description: space.description ?? null,
    provider: "native",
    location: "local",
    linkedFolder: space.linked ? space.folders[0] : undefined,
    liveSync: Boolean(space.linked && space.liveSync !== false),
    source: space.source,
    permission: "manage",
    color: "#0d9488",
    status: "active",
    isDefault: index === 0,
    autoGrantNewAgents: space.autoGrantNewAgents ?? true,
    autoRetrieve: true,
    grants: (space.grants ?? []).map((grant) => ({ ...grant, grantId: grant.id })),
    counts: { documents: space.files.length, links: graph.edges.filter((edge) => edge.resolved).length, folders: safeFolderCount(space) },
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

const editableExtensions = new Set([".md", ".mdx", ".txt"]);

function contentFor(file: KnowledgeFile) {
  // Extracted documents (PDF, Office) are shown as their indexed text.
  if (file.format && file.format !== "text") return file.excerpt;
  return readFileSync(file.path, "utf8");
}

type GraphLink = { linkId: string; targetPath: string; relation: string; documentId: string | null; title: string | null; path: string | null };

/**
 * Builds note links from [[wiki links]] and relative Markdown links. Targets
 * resolve by relative path first, then by file name, as in common Markdown
 * vaults.
 */
function buildGraph(space: KnowledgeSpace) {
  const files = filesFor(space);
  const entries = files.map((file) => {
    const path = relativeFile(space, file);
    return { file, path, id: idFor(space.id, path), stem: path.replace(/\.[^/.]+$/, "").toLowerCase(), name: basename(path, extname(path)).toLowerCase() };
  });
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]));
  const byStem = new Map(entries.map((entry) => [entry.stem, entry]));
  const byName = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!byName.has(entry.name)) byName.set(entry.name, entry);
  const resolve = (from: string, target: string) => {
    const clean = target.replaceAll("\\", "/").replace(/^\.\//, "");
    const relativeTarget = posix.normalize(posix.join(posix.dirname(from), clean)).toLowerCase();
    return byPath.get(relativeTarget) ?? byStem.get(relativeTarget) ?? byPath.get(`${relativeTarget}.md`)
      ?? byPath.get(clean.toLowerCase()) ?? byStem.get(clean.toLowerCase())
      ?? byName.get(basename(clean, extname(clean)).toLowerCase());
  };
  const outgoing = new Map<string, GraphLink[]>();
  const backlinks = new Map<string, GraphLink[]>();
  const edges: Array<{ id: string; source: string; target: string | null; targetPath: string; relation: string; resolved: boolean }> = [];
  for (const entry of entries) {
    if (entry.file.format && entry.file.format !== "text") continue;
    const links = extractLinks(entry.file.excerpt);
    for (const target of links) {
      const hit = resolve(entry.path, target);
      if (hit?.id === entry.id) continue;
      const linkId = createHash("sha256").update(`${entry.id}->${target}`).digest("hex").slice(0, 16);
      edges.push({ id: linkId, source: entry.id, target: hit?.id ?? null, targetPath: hit?.path ?? target, relation: "links_to", resolved: Boolean(hit) });
      const out = outgoing.get(entry.id) ?? [];
      out.push({ linkId, targetPath: hit?.path ?? target, relation: "links_to", documentId: hit?.id ?? null, title: hit ? basename(hit.path, extname(hit.path)) : null, path: hit?.path ?? null });
      outgoing.set(entry.id, out);
      if (hit) {
        const back = backlinks.get(hit.id) ?? [];
        back.push({ linkId, targetPath: entry.path, relation: "linked_from", documentId: entry.id, title: basename(entry.path, extname(entry.path)), path: entry.path });
        backlinks.set(hit.id, back);
      }
    }
  }
  const degree = new Map<string, number>();
  for (const edge of edges) {
    if (!edge.resolved || !edge.target) continue;
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const nodes = entries.map((entry) => ({
    id: entry.id,
    title: basename(entry.path, extname(entry.path)),
    path: entry.path,
    folder: posix.dirname(entry.path) === "." ? "" : posix.dirname(entry.path),
    tags: entry.file.format && entry.file.format !== "text" ? [] : extractTags(entry.file.excerpt),
    degree: degree.get(entry.id) ?? 0,
    updatedAt: entry.file.modifiedAt,
  }));
  return { nodes, edges, outgoing, backlinks };
}

function safeGraph(space: KnowledgeSpace) {
  try { return buildGraph(space); } catch { return { nodes: [], edges: [], outgoing: new Map(), backlinks: new Map() }; }
}

function safeFolderCount(space: KnowledgeSpace) {
  try { return listFolders(space).length; } catch { return 0; }
}

function documentView(space: KnowledgeSpace, file: KnowledgeFile, includeContent = false, graph?: ReturnType<typeof buildGraph>) {
  const path = relativeFile(space, file);
  const stats = statSync(file.path);
  const content = includeContent ? contentFor(file) : undefined;
  const documentId = idFor(space.id, path);
  const editable = editableExtensions.has(extname(path).toLowerCase());
  return {
    documentId, spaceId: space.id, path,
    title: basename(path, extname(path)), content,
    revision: Math.trunc(stats.mtimeMs), frontmatter: {},
    tags: editable ? extractTags(file.excerpt) : [],
    format: file.format ?? "text",
    editable,
    contentHash: createHash("sha256").update(content ?? file.excerpt).digest("hex"),
    createdAt: stats.birthtime.toISOString(), updatedAt: stats.mtime.toISOString(),
    outgoing: graph?.outgoing.get(documentId) ?? [], backlinks: graph?.backlinks.get(documentId) ?? [],
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
        const description = typeof body.description === "string" ? body.description.trim().slice(0, 2_000) : undefined;
        const state = await runtime.addKnowledgeSpace(name, folders, { description, autoGrantNewAgents: body.allAgents !== false });
        return ok(spaceView(state.spaces.at(-1)!, state.spaces.length - 1));
      }
    }
    if (parts[0] === "search" && method === "GET") {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      const selected = url.searchParams.getAll("spaceIds");
      const spaces = runtime.state().spaces.filter((space) => !selected.length || selected.includes(space.id));
      const chunks = searchChunks(spaces, query, Math.min(Number(url.searchParams.get("limit") ?? 8), 50));
      const top = Math.max(...chunks.map((chunk) => chunk.score), 1);
      const seen = new Set<string>();
      const results = chunks.flatMap((chunk) => {
        const space = spaces.find((item) => item.id === chunk.spaceId)!;
        const file = space.files.find((item) => item.path === chunk.path);
        if (!file) return [];
        const view = documentView(space, file);
        const key = `${view.documentId}:${chunk.heading ?? chunk.startLine}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...view, spaceName: space.name, heading: chunk.heading ?? null, excerpt: chunk.text.slice(0, 400), lines: `${chunk.startLine}-${chunk.endLine}`, score: chunk.score / top, matchedBy: ["content"] }];
      });
      return ok({ results });
    }
    const spaces = runtime.state().spaces;
    const space = spaces.find((item) => item.id === parts[0]);
    if (!space) return bad("Knowledge Space not found", 404);
    const root = rootFor(space);
    if (parts.length === 1) {
      if (method === "GET") return ok(spaceView(space, spaces.indexOf(space)));
      if (method === "PATCH") {
        const state = runtime.updateKnowledgeSpace(space.id, {
          autoGrantNewAgents: typeof body.autoGrantNewAgents === "boolean" ? body.autoGrantNewAgents : undefined,
          name: typeof body.name === "string" ? body.name : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          liveSync: typeof body.liveSync === "boolean" ? body.liveSync : undefined,
        });
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
    if (parts[1] === "graph" && method === "GET") {
      const graph = buildGraph(space);
      return ok({ nodes: graph.nodes, edges: graph.edges });
    }
    if (parts[1] === "reindex" && method === "POST") {
      const state = await runtime.reindexKnowledgeSpace(space.id);
      return ok(spaceView(state.spaces.find((item) => item.id === space.id)!, spaces.indexOf(space)));
    }
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
      if (method === "GET") return ok(documentView(space, file, true, buildGraph(space)));
      if (method === "PATCH" && !editableExtensions.has(extname(file.path).toLowerCase())) {
        return bad("PDF and Office documents are read only in Knowledge. Edit the original file; changes sync automatically.", 409);
      }
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
