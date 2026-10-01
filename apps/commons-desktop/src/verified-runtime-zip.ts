import { createWriteStream, promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { open, type Entry, type ZipFile } from "yauzl";

const MAX_ENTRIES = 2_048;
const MAX_EXTRACTED_BYTES = 1_000_000_000;

/** Extract a checksum-verified runtime archive without following archive links. */
export async function extractVerifiedRuntimeZip(archive: string, destination: string): Promise<void> {
  const root = resolve(destination);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const zip = await new Promise<ZipFile>((resolveZip, rejectZip) => {
    open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
      (error, file) => error ? rejectZip(error) : resolveZip(file));
  });

  await new Promise<void>((resolveExtract, rejectExtract) => {
    const seen = new Set<string>();
    let totalBytes = 0;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      rejectExtract(error);
    };
    zip.on("error", fail);
    zip.on("end", () => { if (!settled) { settled = true; resolveExtract(); } });
    zip.on("entry", (entry: Entry) => {
      void (async () => {
        const name = entry.fileName;
        const relative = name.endsWith("/") ? name.slice(0, -1) : name;
        const segments = relative.split("/");
        if (!relative || name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\\") || name.includes("\0") ||
            segments.some((segment) => !segment || segment === "." || segment === "..")) {
          throw new Error("Image runtime archive contains an invalid path.");
        }
        const key = relative.toLowerCase();
        if (seen.has(key) || seen.size >= MAX_ENTRIES) throw new Error("Image runtime archive contains duplicate or excessive entries.");
        seen.add(key);

        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        const fileType = mode & 0o170000;
        const isDirectory = name.endsWith("/");
        if (fileType && fileType !== (isDirectory ? 0o040000 : 0o100000)) {
          throw new Error("Image runtime archive contains a link or unsupported file type.");
        }
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 ||
            totalBytes + entry.uncompressedSize > MAX_EXTRACTED_BYTES) {
          throw new Error("Image runtime archive is too large when extracted.");
        }
        totalBytes += entry.uncompressedSize;

        const target = resolve(root, ...segments);
        if (!target.startsWith(`${root}${sep}`)) throw new Error("Image runtime archive escapes its destination.");
        if (isDirectory) {
          await fs.mkdir(target, { recursive: true, mode: 0o700 });
        } else {
          await fs.mkdir(dirname(target), { recursive: true, mode: 0o700 });
          const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
            zip.openReadStream(entry, (error, readStream) => error ? rejectStream(error) : resolveStream(readStream));
          });
          await pipeline(stream, createWriteStream(target, { flags: "wx", mode: 0o600 }));
        }
      })().then(() => { if (!settled) zip.readEntry(); }).catch(fail);
    });
    zip.readEntry();
  });
}
