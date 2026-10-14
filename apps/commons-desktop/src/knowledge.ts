import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import type { KnowledgeFile, KnowledgeSourceInfo, KnowledgeSpace } from "@agent-commons/desktop-contract";

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
const documents = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);

const MAX_FILES = 2_000;
const MAX_TOTAL_CHARS = 30_000_000;
const MAX_TEXT_BYTES = 750_000;
const MAX_DOCUMENT_BYTES = 30_000_000;
const MAX_INDEXED_CHARS = 120_000;

export function allowed(name: string) {
  if (/^\.env(?:\.|$)/i.test(name) && name !== ".env.example") return false;
  if (/^(?:id_rsa|id_ed25519)$/i.test(name)) return false;
  const extension = extname(name).toLowerCase();
  return readable.has(extension) || documents.has(extension) || name === "Dockerfile" || name === "Makefile";
}

export function isIgnoredPath(path: string) {
  return path.split(/[\\/]/).some((part) => ignored.has(part) || (part.startsWith(".") && part.length > 1 && part !== ".env.example"));
}

type DocumentExtractor = (path: string) => Promise<string>;
let documentExtractor: DocumentExtractor | null = null;

/** The desktop runtime supplies PDF and Office extraction from the shared local tools. */
export function setDocumentExtractor(extractor: DocumentExtractor) {
  documentExtractor = extractor;
}

function isExtractableDocument(path: string) {
  return documents.has(extname(path).toLowerCase());
}

function formatFor(path: string): KnowledgeFile["format"] {
  const extension = extname(path).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (documents.has(extension)) return "office";
  return "text";
}

/**
 * Reads a knowledge file's text. Documents are extracted; everything else is
 * UTF-8. Returns null for binary or oversized files.
 */
export async function readKnowledgeText(path: string, size: number): Promise<string | null> {
  if (isExtractableDocument(path)) {
    if (size > MAX_DOCUMENT_BYTES || !documentExtractor) return null;
    const text = await documentExtractor(path).catch(() => "");
    if (!text || /^\[Cannot extract/.test(text)) return null;
    return text;
  }
  if (size > MAX_TEXT_BYTES) return null;
  const content = await readFile(path, "utf8");
  return content.includes("\0") ? null : content;
}

/**
 * Indexes folders or files. Files whose size and modification time match the
 * previous index are reused, so a reindex after a small edit is fast even when
 * the folder contains large PDFs.
 */
export async function indexFolders(folders: string[], previous: KnowledgeFile[] = []): Promise<KnowledgeFile[]> {
  const files: KnowledgeFile[] = [];
  const cache = new Map(previous.map((file) => [file.path, file]));
  let totalChars = 0;

  async function add(path: string) {
    if (files.length >= MAX_FILES || totalChars >= MAX_TOTAL_CHARS) return;
    try {
      const info = await stat(path);
      const modifiedAt = info.mtime.toISOString();
      const cached = cache.get(path);
      if (cached && cached.size === info.size && cached.modifiedAt === modifiedAt) {
        totalChars += cached.excerpt.length;
        files.push(cached);
        return;
      }
      const text = await readKnowledgeText(path, info.size);
      if (text === null) return;
      const excerpt = text.slice(0, MAX_INDEXED_CHARS);
      totalChars += excerpt.length;
      files.push({ path, size: info.size, modifiedAt, excerpt, format: formatFor(path) });
    } catch {
      // A file can disappear while the indexer is walking. Skip it safely.
    }
  }

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 20 || files.length >= MAX_FILES || totalChars >= MAX_TOTAL_CHARS) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalChars >= MAX_TOTAL_CHARS) break;
      if (ignored.has(entry.name) || (entry.name.startsWith(".") && entry.isDirectory())) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
        continue;
      }
      if (entry.isFile() && allowed(entry.name)) await add(path);
    }
  }

  for (const source of folders) {
    try {
      const info = await lstat(source);
      if (info.isSymbolicLink()) continue;
      if (info.isFile() && allowed(basename(source))) await add(source);
      else if (info.isDirectory()) await walk(source, 0);
    } catch {
      // Skip missing or inaccessible sources.
    }
  }
  return files;
}

/** Finds the git repository containing a folder and reads its branch and commit. */
export function gitInfo(folder: string): KnowledgeSourceInfo["git"] | undefined {
  let current = folder;
  for (let depth = 0; depth < 12; depth += 1) {
    const dotGit = join(current, ".git");
    try {
      if (existsSync(dotGit)) {
        let gitDir = dotGit;
        if (statSync(dotGit).isFile()) {
          // Worktrees and submodules point at their git directory.
          const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
          if (!pointer) return { root: current };
          gitDir = isAbsolute(pointer) ? pointer : join(current, pointer);
        }
        const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
        const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
        let commit = ref ? undefined : head;
        if (ref) {
          const loose = join(gitDir, ref);
          if (existsSync(loose)) commit = readFileSync(loose, "utf8").trim();
          else {
            const packed = join(gitDir, "packed-refs");
            if (existsSync(packed)) {
              commit = readFileSync(packed, "utf8").split("\n").find((line) => line.endsWith(` ${ref}`))?.split(" ")[0];
            }
          }
        }
        return {
          root: current,
          branch: ref?.replace(/^refs\/heads\//, ""),
          commit: commit?.slice(0, 12),
        };
      }
    } catch {
      return undefined;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

export type KnowledgeChunk = {
  spaceId: string;
  space: string;
  path: string;
  /** Path relative to the space's folder, used in citations. */
  source: string;
  heading?: string;
  startLine: number;
  endLine: number;
  text: string;
};

function sourcePath(space: KnowledgeSpace, path: string) {
  for (const folder of space.folders) {
    const offset = relative(folder, path);
    if (offset && !offset.startsWith("..") && !isAbsolute(offset)) return offset.replaceAll("\\", "/");
  }
  return basename(path);
}

/** Splits indexed text into heading-aware chunks with line ranges. */
export function chunkFile(space: KnowledgeSpace, file: KnowledgeFile): KnowledgeChunk[] {
  const lines = file.excerpt.split("\n");
  const chunks: KnowledgeChunk[] = [];
  let heading: string | undefined;
  let start = 0;
  let buffer: string[] = [];
  let size = 0;
  let hasBody = false;
  const flush = (end: number) => {
    const text = buffer.join("\n").trim();
    if (text) {
      chunks.push({
        spaceId: space.id,
        space: space.name,
        path: file.path,
        source: sourcePath(space, file.path),
        heading,
        startLine: start + 1,
        endLine: end,
        text,
      });
    }
    buffer = [];
    size = 0;
    hasBody = false;
  };
  lines.forEach((line, index) => {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    // Each section becomes its own passage so citations point at it exactly.
    if ((headingMatch && hasBody) || size > 1_400) {
      flush(index);
      start = index;
    }
    if (headingMatch) heading = headingMatch[2].trim();
    else if (line.trim()) hasBody = true;
    buffer.push(line);
    size += line.length + 1;
  });
  flush(lines.length);
  return chunks;
}

function terms(query: string) {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "what", "about", "into", "your", "have", "are", "was", "how", "why", "who", "can", "you"]);
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])]
    .filter((term) => !stop.has(term))
    .slice(0, 24);
}

/**
 * Ranks chunks with a small BM25-style score: rare terms weigh more, repeated
 * terms saturate, and matches in the file name or heading count extra.
 */
export function searchChunks(spaces: KnowledgeSpace[], query: string, limit = 8): Array<KnowledgeChunk & { score: number }> {
  const wanted = terms(query);
  if (!wanted.length) return [];
  const chunks = spaces.flatMap((space) => space.files.flatMap((file) => chunkFile(space, file)));
  if (!chunks.length) return [];
  const lowered = chunks.map((chunk) => `${chunk.source}\n${chunk.heading ?? ""}\n${chunk.text}`.toLowerCase());
  const documentFrequency = new Map(wanted.map((term) => [term, lowered.filter((text) => text.includes(term)).length]));
  const averageLength = lowered.reduce((sum, text) => sum + text.length, 0) / lowered.length;
  return chunks
    .map((chunk, index) => {
      const text = lowered[index];
      const title = `${chunk.source}\n${chunk.heading ?? ""}`.toLowerCase();
      let score = 0;
      for (const term of wanted) {
        const frequency = text.split(term).length - 1;
        if (!frequency) continue;
        const df = documentFrequency.get(term) ?? 1;
        const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
        score += idf * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * (text.length / averageLength))));
        if (title.includes(term)) score += idf * 0.8;
      }
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

/** Compatibility wrapper used by prompt context: best chunks with a citation label. */
export function searchSpaces(spaces: KnowledgeSpace[], query: string, ids?: string[]) {
  return searchChunks(spaces.filter((space) => !ids?.length || ids.includes(space.id)), query, 8).map((chunk) => ({
    space: chunk.space,
    path: chunk.path,
    source: chunk.source,
    lines: `${chunk.startLine}-${chunk.endLine}`,
    heading: chunk.heading,
    excerpt: chunk.text.slice(0, 1_800),
  }));
}

export function accessibleSpaces(spaces: KnowledgeSpace[], agentId: string, ids?: string[]) {
  return spaces.filter((space) => (ids === undefined || ids.includes(space.id)) &&
    (space.autoGrantNewAgents !== false || space.grants?.some((grant) =>
      grant.subjectType === "agent" && grant.subjectId === agentId)));
}

/** Link targets in Markdown text: [[wiki links]] and relative [text](links). */
export function extractLinks(content: string) {
  const targets: string[] = [];
  for (const match of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) targets.push(match[1].trim());
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = decodeURIComponent(match[1].split("#")[0]);
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
    targets.push(target);
  }
  return [...new Set(targets)];
}

export function extractTags(content: string) {
  const tags = new Set<string>();
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  const listed = frontmatter && /^tags:\s*(.+)$/m.exec(frontmatter)?.[1];
  if (listed) {
    for (const tag of listed.replace(/[[\]"']/g, "").split(",")) if (tag.trim()) tags.add(tag.trim().replace(/^#/, ""));
  }
  const body = frontmatter ? content.slice(content.indexOf("---", 3) + 3) : content;
  for (const match of body.matchAll(/(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]{1,40})/gu)) tags.add(match[1]);
  return [...tags].slice(0, 20);
}

export async function knowledgeTool(spaces: KnowledgeSpace[], name: string, args: Record<string, unknown>) {
  if (name === "list_knowledge_spaces") return JSON.stringify(spaces.map((space) => ({
    spaceId: space.id, name: space.name, description: space.description, documents: space.files.length, indexedAt: space.indexedAt,
    ...(space.source?.git ? { git: { branch: space.source.git.branch, commit: space.source.git.commit } } : {}),
  })));
  if (name === "search_knowledge") {
    const selected = typeof args.spaceId === "string" ? spaces.filter((space) => space.id === args.spaceId) : spaces;
    return JSON.stringify(searchChunks(selected, String(args.query ?? ""), 8).map((chunk, index) => ({
      citation: index + 1,
      spaceId: chunk.spaceId,
      space: chunk.space,
      source: chunk.source,
      path: chunk.path,
      lines: `${chunk.startLine}-${chunk.endLine}`,
      heading: chunk.heading,
      text: chunk.text.slice(0, 2_400),
    })));
  }
  const space = spaces.find((item) => item.id === args.spaceId);
  if (!space) return "Error: Knowledge Space is not available to this agent or conversation.";
  const offset = Number.isFinite(Number(args.offset)) ? Math.max(0, Math.trunc(Number(args.offset))) : 0;
  if (name === "list_knowledge_documents") return JSON.stringify({
    spaceId: space.id, name: space.name, total: space.files.length,
    documents: space.files.slice(offset, offset + 50).map((file) => ({ path: file.path, source: sourcePath(space, file.path), name: basename(file.path), size: file.size, modifiedAt: file.modifiedAt })),
    nextOffset: offset + 50 < space.files.length ? offset + 50 : null,
  });
  const file = space.files.find((item) => item.path === args.path || sourcePath(space, item.path) === args.path);
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
    const info = await stat(canonical);
    const content = await readKnowledgeText(canonical, info.size);
    if (content === null) return "Error: Document is too large or has no readable text.";
    const slice = content.slice(offset, offset + 8_000);
    const firstLine = content.slice(0, offset).split("\n").length;
    return JSON.stringify({
      spaceId: space.id,
      source: sourcePath(space, file.path),
      path: file.path,
      lines: `${firstLine}-${firstLine + slice.split("\n").length - 1}`,
      content: slice,
      nextOffset: offset + 8_000 < content.length ? offset + 8_000 : null,
    });
  } catch {
    return "Error: Document is no longer readable. Reindex the Knowledge Space.";
  }
}
