import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, rmSync, statSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';

function retryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: string; code?: string; cause?: unknown; retryable?: boolean };
  return value.retryable === true || /^(?:terminated|fetch failed)$/.test(value.message ?? '')
    || /^(?:ECONNRESET|ETIMEDOUT|EPIPE|ERR_STREAM_PREMATURE_CLOSE|UND_ERR_SOCKET|UND_ERR_BODY_TIMEOUT|UND_ERR_CONNECT_TIMEOUT)$/.test(value.code ?? '')
    || retryable(value.cause);
}

/** Resume interrupted private temporary files; never install unverified bytes. */
export async function downloadVerified(url: string, destination: string, sha256: string, onProgress: (progress: number) => void, maxBytes: number, ownerSignal?: AbortSignal) {
  const signal = ownerSignal ? AbortSignal.any([ownerSignal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000);
  let expectedTotal = 0;
  const checkHash = async () => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) { signal.throwIfAborted(); hash.update(chunk); }
    if (hash.digest('hex') !== sha256) throw new Error('Downloaded model or runtime failed its checksum. Retry the download.');
  };
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      try {
        let offset = existsSync(destination) ? statSync(destination).size : 0;
        if (offset > maxBytes) throw new Error('The model download is larger than expected.');
        // A socket can fail after all payload bytes were written. Verify them
        // rather than asking the server for an out-of-bounds range.
        if (offset && offset === expectedTotal) { await checkHash(); return; }
        const response = await fetch(url, { redirect: 'follow', signal, headers: offset ? { Range: `bytes=${offset}-` } : undefined });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw Object.assign(new Error(`Model download failed (${response.status})`), { retryable: response.status === 429 || response.status >= 500 });
        }
        let totalBytes = Number(response.headers.get('content-length') || 0);
        if (response.status === 206) {
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
          if (!range || Number(range[1]) !== offset || Number(range[2]) < offset || Number(range[3]) <= Number(range[2])) {
            await response.body.cancel();
            throw new Error('The model download returned an invalid resume range.');
          }
          totalBytes = Number(range[3]);
        } else if (response.status === 200) offset = 0; // Server ignored Range: replace the partial file.
        else { await response.body.cancel(); throw new Error('Unexpected model download response.'); }
        if (totalBytes > maxBytes) { await response.body.cancel(); throw new Error('The model download is larger than expected.'); }
        expectedTotal = totalBytes;
        let downloaded = offset;
        const verifySize = new Transform({ transform(chunk: Buffer, _encoding, callback) {
          downloaded += chunk.length;
          if (downloaded > maxBytes) return callback(new Error('The model download is larger than expected.'));
          if (totalBytes) onProgress(Math.min(0.99, downloaded / totalBytes));
          callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>), verifySize,
          createWriteStream(destination, { flags: offset ? 'a' : 'w', mode: 0o600 }), { signal });
        if (totalBytes && downloaded !== totalBytes) throw Object.assign(new Error('Incomplete model download.'), { retryable: true });
        await checkHash();
        return;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 2 || !retryable(error)) throw error;
        await delay(250 * (attempt + 1), undefined, { signal });
      }
    }
  } catch (error) { rmSync(destination, { force: true }); throw error; }
}
