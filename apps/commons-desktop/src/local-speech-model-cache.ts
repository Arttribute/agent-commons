import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, statfsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export type SpeechArtifact = { model: string; revision: string; file: string; bytes: number; sha256: string };
const FREE_SPACE_RESERVE = 256 * 1024 * 1024;

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
