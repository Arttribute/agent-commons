import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const statePath = (output: string) => join(dirname(output), `published-${createHash('sha256').update(resolve(output)).digest('hex').slice(0, 16)}.json`);

/** Only successful output publication advances this baseline. Failed runs stay pending. */
export function readOutputPublicationState(output: string): Map<string, string> | undefined {
  const path = statePath(output);
  if (!existsSync(path)) return undefined;
  if (lstatSync(path).isSymbolicLink()) throw new Error('Output publication state contains a symbolic link.');
  const values = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  const result = new Map<string, string>();
  for (const [name, digest] of Object.entries(values)) {
    const file = resolve(output, name), offset = relative(output, file);
    if (isAbsolute(offset) || offset === '..' || offset.startsWith(`..${sep}`) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid output publication state.');
    result.set(file, digest);
  }
  return result;
}

export function saveOutputPublicationState(output: string, files: Map<string, string>) {
  const path = statePath(output), temporary = `${path}.${randomUUID()}.tmp`;
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Output publication state contains a symbolic link.');
  writeFileSync(temporary, JSON.stringify(Object.fromEntries([...files].map(([file, digest]) => [relative(output, file), digest]))), { mode: 0o600 });
  renameSync(temporary, path);
}
