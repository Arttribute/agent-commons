import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { open, type Entry, type ZipFile } from "yauzl";

const MAX_FILES = 2_000;
const MAX_BYTES = 250 * 1024 * 1024;

/** Read/extract only bounded, ordinary ZIP entries; never follow archived links or paths. */
export async function readArchive(path: string, destination?: string) {
  const zip = await new Promise<ZipFile>((resolve, reject) => open(path, { lazyEntries: true }, (error, file) => error || !file ? reject(error ?? new Error("Invalid ZIP")) : resolve(file)));
  const entries: Array<{ path: string; bytes: number }> = [];
  let total = 0;
  let createdDestination = false;
  try {
    if (destination) { mkdirSync(destination, { recursive: false, mode: 0o700 }); createdDestination = true; }
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          const name = entry.fileName.replaceAll("\\", "/");
          const segments = name.split("/");
          if (name.startsWith("/") || segments.includes("..") || segments.some((part) => part.includes(":") || /^(?:\.ssh|\.aws|\.gnupg|\.env(?:\..*)?)$/i.test(part))) throw new Error("Unsafe path in ZIP archive.");
          if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error("ZIP symlinks are not supported.");
          total += entry.uncompressedSize;
          if (entries.length >= MAX_FILES || total > MAX_BYTES) throw new Error("ZIP exceeds the 2,000-file or 250 MB expanded limit.");
          entries.push({ path: name, bytes: entry.uncompressedSize });
          if (destination) {
            const target = join(destination, ...segments);
            if (name.endsWith("/")) mkdirSync(target, { recursive: true, mode: 0o700 });
            else {
              mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
              const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (error, readable) => error || !readable ? rej(error) : res(readable)));
              await pipeline(stream, createWriteStream(target, { flags: "wx", mode: 0o600 }));
            }
          }
          zip.readEntry();
        })().catch((error) => { zip.close(); reject(error); });
      });
      zip.readEntry();
    });
    return { files: entries, totalBytes: total, ...(destination ? { directory: destination } : {}) };
  } catch (error) {
    if (destination && createdDestination) rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally { zip.close(); }
}
