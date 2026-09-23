import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
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

function relevantExcerpt(content: string, terms: string[]) {
  const lower = content.toLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((position) => position >= 0);
  const center = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, center - 1_000);
  return content.slice(start, start + 4_000);
}
