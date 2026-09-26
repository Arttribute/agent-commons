import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import type { KnowledgeFile, KnowledgeSpace } from "@agent-commons/desktop-contract";

const ignored = new Set([
  ".git",
  ".svn",
  ".hg",
  ".ssh",
  ".aws",
  ".agc",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);
const readable = new Set([
  ".txt", ".md", ".mdx", ".json", ".jsonl", ".csv", ".tsv",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".cs",
  ".html", ".css", ".scss", ".sql", ".yaml", ".yml", ".toml",
  ".xml", ".sh", ".zsh", ".fish", ".env.example",
]);

function allowed(name: string) {
  if (/^\.env(?:\.|$)/i.test(name) && name !== ".env.example") return false;
  if (/^(?:id_rsa|id_ed25519)$/i.test(name)) return false;
  return readable.has(extname(name).toLowerCase()) || name === "Dockerfile" || name === "Makefile";
}

export async function indexFolders(folders: string[]): Promise<KnowledgeFile[]> {
  const files: KnowledgeFile[] = [];
  let totalBytes = 0;

  async function walk(root: string, directory: string, depth: number): Promise<void> {
    if (depth > 20 || files.length >= 2_000 || totalBytes >= 30_000_000) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= 2_000 || totalBytes >= 30_000_000) break;
      if (ignored.has(entry.name) || (entry.name.startsWith(".") && entry.isDirectory())) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(root, path, depth + 1);
        continue;
      }
      if (!entry.isFile() || !allowed(entry.name)) continue;
      try {
        const info = await stat(path);
        if (info.size > 750_000) continue;
        const content = await readFile(path, "utf8");
        if (content.includes("\0")) continue;
        totalBytes += info.size;
        files.push({
          path,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
          excerpt: content.slice(0, 80_000),
        });
      } catch {
        // A file can disappear while the indexer is walking. Skip it safely.
      }
    }
  }

  async function indexFile(path: string): Promise<void> {
    if (files.length >= 2_000 || totalBytes >= 30_000_000 || !allowed(path)) return;
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size > 750_000) return;
      const content = await readFile(path, "utf8");
      if (content.includes("\0")) return;
      totalBytes += info.size;
      files.push({
        path,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        excerpt: content.slice(0, 80_000),
      });
    } catch {
      // A selected file can disappear before indexing. Skip it safely.
    }
  }

  for (const source of folders) {
    try {
      const info = await lstat(source);
      if (info.isSymbolicLink()) continue;
      if (info.isFile()) await indexFile(source);
      else if (info.isDirectory()) await walk(source, source, 0);
    } catch {
      // Skip missing or inaccessible sources.
    }
  }
  return files;
}

export function searchSpaces(spaces: KnowledgeSpace[], query: string, ids?: string[]) {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? [])].slice(0, 20);
  if (!terms.length) return [];
  return spaces
    .filter((space) => !ids?.length || ids.includes(space.id))
    .flatMap((space) =>
      space.files.map((file) => {
        const haystack = `${file.path}\n${file.excerpt}`.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { space: space.name, file, score };
      }),
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ space, file }) => ({
      space,
      path: file.path,
      excerpt: relevantExcerpt(file.excerpt, terms),
    }));
}

export function accessibleSpaces(spaces: KnowledgeSpace[], agentId: string, ids?: string[]) {
  return spaces.filter((space) => (!ids?.length || ids.includes(space.id)) &&
    (space.autoGrantNewAgents !== false || space.grants?.some((grant) =>
      grant.subjectType === "agent" && grant.subjectId === agentId)));
}

export async function knowledgeTool(spaces: KnowledgeSpace[], name: string, args: Record<string, unknown>) {
  if (name === "list_knowledge_spaces") return JSON.stringify(spaces.map((space) => ({
    spaceId: space.id, name: space.name, documents: space.files.length, indexedAt: space.indexedAt,
  })));
  if (name === "search_knowledge") return JSON.stringify(searchSpaces(spaces, String(args.query ?? "")));
  const space = spaces.find((item) => item.id === args.spaceId);
  if (!space) return "Error: Knowledge Space is not available to this agent or conversation.";
  const offset = Number.isFinite(Number(args.offset)) ? Math.max(0, Math.trunc(Number(args.offset))) : 0;
  if (name === "list_knowledge_documents") return JSON.stringify({
    spaceId: space.id, name: space.name, total: space.files.length,
    documents: space.files.slice(offset, offset + 50).map((file) => ({ path: file.path, name: basename(file.path), size: file.size })),
    nextOffset: offset + 50 < space.files.length ? offset + 50 : null,
  });
  const file = space.files.find((item) => item.path === args.path);
  if (!file) return "Error: Document not found. Use a path returned by list_knowledge_documents.";
  try {
    // A linked folder can change after indexing. Resolve it again before reading.
    const canonical = await realpath(file.path);
    let withinSource = false;
    for (const source of space.folders) {
      const root = await realpath(source);
      const rel = relative(root, canonical);
      if (canonical === root || (!rel.startsWith("..") && !isAbsolute(rel) && (await stat(root)).isDirectory())) withinSource = true;
    }
    if (!withinSource || !(await lstat(file.path)).isFile() || !allowed(basename(file.path))) return "Error: Document is outside its Knowledge source.";
    if ((await stat(canonical)).size > 750_000) return "Error: Document is too large. Reindex the Knowledge Space.";
    const content = await readFile(canonical, "utf8");
    return JSON.stringify({ spaceId: space.id, path: file.path, content: content.slice(offset, offset + 6_000), nextOffset: offset + 6_000 < content.length ? offset + 6_000 : null });
  } catch {
    return "Error: Document is no longer readable. Reindex the Knowledge Space.";
  }
}

function relevantExcerpt(content: string, terms: string[]) {
  const lower = content.toLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
  const center = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, center - 1_000);
  return content.slice(start, start + 4_000);
}
