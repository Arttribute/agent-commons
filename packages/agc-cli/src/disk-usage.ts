import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/** Bounded read-only scan. The caller validates the root and rejects sensitive paths. */
export async function scanDiskUsage(root: string, signal: AbortSignal | undefined, allowPath: (path: string) => void) {
  if (!(await fs.lstat(root)).isDirectory()) throw new Error('disk_usage requires a directory');
  const deadline = Date.now() + 15_000;
  const limit = 50_000;
  let scanned = 0;
  let skipped = 0;
  let incomplete = false;
  const measure = async (start: string): Promise<number> => {
    let bytes = 0;
    const pending = [start];
    while (pending.length) {
      if (signal?.aborted) throw new Error('Disk usage scan cancelled');
      if (scanned >= limit || Date.now() >= deadline) { incomplete = true; break; }
      const path = pending.pop()!;
      try {
        allowPath(path);
        const item = await fs.lstat(path);
        scanned += 1;
        if (item.isSymbolicLink()) { skipped += 1; continue; }
        if (item.isDirectory()) {
          for await (const child of await fs.opendir(path)) {
            if (pending.length + scanned >= limit || Date.now() >= deadline) { incomplete = true; break; }
            pending.push(join(path, child.name));
          }
        } else if (item.isFile()) bytes += item.size;
      } catch { skipped += 1; }
    }
    return bytes;
  };
  const entries: Array<{ path: string; kind: 'file' | 'directory'; sizeBytes: number }> = [];
  for await (const child of await fs.opendir(root)) {
    if (incomplete) break;
    if (child.isSymbolicLink()) { skipped += 1; continue; }
    const path = join(root, child.name);
    try { allowPath(path); }
    catch { skipped += 1; continue; }
    entries.push({ path: child.name, kind: child.isDirectory() ? 'directory' : 'file', sizeBytes: await measure(path) });
  }
  entries.sort((left, right) => right.sizeBytes - left.sizeBytes);
  return { scope: root, unit: 'logical file bytes', entries: entries.slice(0, 30), scanned, skipped, incomplete,
    note: incomplete ? 'The bounded scan stopped early. Sizes may be underestimates; narrow the path and scan again.' : 'Sizes cover this selected folder only, not the whole computer.' };
}
