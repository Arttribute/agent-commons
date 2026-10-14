import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, statfsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type SpeechArtifact = { model: string; revision: string; file: string; bytes: number; sha256: string };
const FREE_SPACE_RESERVE = 256 * 1024 * 1024;
const downloads = new Map<string, Promise<void>>();

function artifactPath(cache: string, artifact: SpeechArtifact) {
  return join(cache, artifact.model, artifact.revision, artifact.file);
}

export function assertSpeechDownloadFits(cache: string, artifacts: readonly SpeechArtifact[]) {
  const missingBytes = artifacts.reduce((sum, artifact) => {
    const path = artifactPath(cache, artifact);
    return sum + (existsSync(path) && statSync(path).size === artifact.bytes ? 0 : artifact.bytes);
  }, 0);
  if (!missingBytes) return;
  const disk = statfsSync(cache);
  const availableBytes = disk.bavail * disk.bsize;
  if (availableBytes < missingBytes + FREE_SPACE_RESERVE) {
    const required = Math.ceil((missingBytes + FREE_SPACE_RESERVE) / 1024 ** 2);
    throw new Error(`This speech model needs about ${required} MB of free disk space to download and retain a safety margin.`);
  }
}

async function artifactMatches(path: string, artifact: SpeechArtifact) {
  if (!existsSync(path) || !lstatSync(path).isFile() || statSync(path).size !== artifact.bytes) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex") === artifact.sha256;
}

/** Transformers' file cache returns before its write handle closes. On Windows
 * ONNX can then fail to open a newly downloaded model with EACCES. Publish only
 * a fully written, closed and checksum-verified weight file. */
export async function prepareSpeechArtifacts(cache: string, artifacts: readonly SpeechArtifact[], fetchArtifact: typeof fetch = fetch) {
  assertSpeechDownloadFits(cache, artifacts);
  for (const artifact of artifacts) {
    const target = artifactPath(cache, artifact);
    if (await artifactMatches(target, artifact)) continue;
    let pending = downloads.get(target);
    if (!pending) {
      pending = (async () => {
        const temporary = `${target}.${randomUUID()}.tmp`;
        await mkdir(join(cache, artifact.model, artifact.revision, 'onnx'), {recursive:true,mode:0o700});
        try {
          const response = await fetchArtifact(`https://huggingface.co/${artifact.model}/resolve/${artifact.revision}/${artifact.file}`, {signal:AbortSignal.timeout(20 * 60_000)});
          if (!response.ok || !response.body) throw new Error(`Speech model download failed (${response.status}).`);
          const file = await open(temporary, 'wx', 0o600);
          const reader = response.body.getReader();
          const hash = createHash('sha256');
          let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > artifact.bytes) throw new Error('Speech weight exceeds its reviewed size.');
              hash.update(chunk.value);
              for (let offset = 0; offset < chunk.value.byteLength;) {
                const {bytesWritten} = await file.write(chunk.value, offset, chunk.value.byteLength - offset);
                if (!bytesWritten) throw new Error('Speech weight could not be saved.');
                offset += bytesWritten;
              }
            }
          } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); await file.close(); }
          if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256) throw new Error('Downloaded speech weight failed its reviewed checksum.');
          await rm(target, {force:true});
          await rename(temporary, target);
        } finally { await rm(temporary, {force:true}).catch(() => undefined); }
      })().finally(() => downloads.delete(target));
      downloads.set(target, pending);
    }
    await pending;
  }
}

/** The Transformers cache can retain partial files after a failed write; remove those before retrying. */
export async function repairSpeechArtifacts(cache: string, artifacts: readonly SpeechArtifact[]) {
  for (const artifact of artifacts) {
    const path = artifactPath(cache, artifact);
    if (lstatSync(path, { throwIfNoEntry: false }) && !(await artifactMatches(path, artifact))) unlinkSync(path);
  }
}

export async function verifySpeechArtifacts(cache: string, artifacts: readonly SpeechArtifact[]) {
  for (const artifact of artifacts) {
    const path = artifactPath(cache, artifact);
    if (!existsSync(path) || !lstatSync(path).isFile() || statSync(path).size !== artifact.bytes) {
      throw new Error(`The ${artifact.model} download did not finish saving to disk. Free space and try again.`);
    }
    if (!(await artifactMatches(path, artifact))) {
      throw new Error(`The saved ${artifact.model} model failed its checksum. Remove that model from the local cache and try again.`);
    }
  }
}
