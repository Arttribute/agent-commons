import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fromRandomAccessReader, RandomAccessReader, type Entry, type ZipFile } from "yauzl";

export type PinnedFile = { path: string; size: number; sha256: string };

/** The server answered a Range request with the whole file; use the full archive instead. */
export class RangeRequestsUnsupportedError extends Error {}

/** Reads byte ranges of a remote archive so only the needed entries are downloaded. */
class HttpRangeReader extends RandomAccessReader {
  readonly url: string;

  constructor(url: string) {
    super();
    this.url = url;
  }

  _readStreamForRange(start: number, end: number) {
    const output = new PassThrough();
    fetch(this.url, {
      headers: { Range: `bytes=${start}-${end - 1}`, "User-Agent": "Agent-Commons-Desktop" },
      signal: AbortSignal.timeout(5 * 60_000),
    }).then((response) => {
      if (response.status !== 206 || !response.body) {
        throw new RangeRequestsUnsupportedError(`Range request returned ${response.status}`);
      }
      Readable.fromWeb(response.body as never).pipe(output);
    }).catch((error) => output.destroy(error));
    return output;
  }
}

/**
 * Install only the pinned files of a remote zip. Each file must match its
 * reviewed size and SHA-256. The files are assembled beside the destination
 * and moved into place only once every one has verified, so an interrupted
 * download never leaves a runtime that looks installed.
 */
export async function installPinnedFilesFromRemoteZip(options: {
  url: string;
  archiveSize: number;
  files: readonly PinnedFile[];
  destination: string;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const destination = resolve(options.destination);
  const staging = `${destination}.partial`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true, mode: 0o700 });
  const wanted = new Map(options.files.map((file) => [file.path, file]));
  const totalBytes = options.files.reduce((sum, file) => sum + file.size, 0);
  let writtenBytes = 0;

  try {
    const zip = await new Promise<ZipFile>((resolveZip, rejectZip) => {
      fromRandomAccessReader(new HttpRangeReader(options.url), options.archiveSize,
        { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
        (error, file) => error ? rejectZip(error) : resolveZip(file));
    });
    const installed = new Set<string>();
    await new Promise<void>((resolveAll, rejectAll) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        rejectAll(error);
      };
      zip.on("error", fail);
      zip.on("end", () => { if (!settled) { settled = true; resolveAll(); } });
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          const pinned = wanted.get(entry.fileName);
          if (!pinned) return;
          if (entry.uncompressedSize !== pinned.size) {
            throw new Error(`Local AI runtime file ${pinned.path} has an unexpected size.`);
          }
          const target = resolve(staging, ...pinned.path.split("/"));
          if (!target.startsWith(`${staging}${sep}`)) throw new Error("Local AI runtime file escapes its destination.");
          await fs.mkdir(dirname(target), { recursive: true, mode: 0o700 });
          const source = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => {
            zip.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream));
          });
          const hash = createHash("sha256");
          const meter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              hash.update(chunk);
              writtenBytes += chunk.length;
              options.onProgress?.(Math.min(writtenBytes / totalBytes, 1));
              callback(null, chunk);
            },
          });
          await pipeline(source, meter, createWriteStream(target, { flags: "wx", mode: 0o700 }));
          if (hash.digest("hex") !== pinned.sha256) {
            throw new Error(`Local AI runtime integrity check failed for ${pinned.path}.`);
          }
          installed.add(pinned.path);
        })().then(() => { if (!settled) zip.readEntry(); }).catch(fail);
      });
      zip.readEntry();
    });
    const missing = options.files.filter((file) => !installed.has(file.path));
    if (missing.length) throw new Error(`Local AI runtime archive is missing ${missing[0].path}.`);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(staging, destination);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}
