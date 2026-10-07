import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type ProfileIndex = { version: 1; legacyOwner: string | null; activeOwner: string | null };

/** Account IDs determine directories, never display names or email addresses.
 * Existing absolute artifact paths remain valid by leaving the legacy profile
 * in place, accessible only to its recorded owner (or the original guest).
 */
export class LocalProfiles {
  private index: ProfileIndex;
  private readonly path: string;
  constructor(private readonly userData: string, legacyOwner: string | null) {
    const root = join(userData, 'private-local');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.path = join(root, 'profiles.json');
    this.index = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) : { version: 1, legacyOwner, activeOwner: legacyOwner };
    if (this.index.version !== 1 || ![this.index.legacyOwner, this.index.activeOwner].every((id) => id === null || typeof id === 'string' && id.length > 0 && id.length <= 256)) throw new Error('Local account profiles could not be read. Their files were left untouched.');
    this.persist();
  }
  get owner() { return this.index.activeOwner; }
  get directory() { return this.directoryFor(this.owner); }
  private directoryFor(owner: string | null) {
    if (owner === this.index.legacyOwner) return this.userData;
    const key = owner === null ? 'guest' : createHash('sha256').update(owner).digest('hex');
    const path = join(this.userData, 'private-local', 'accounts', key);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') chmodSync(path, 0o700);
    return path;
  }
  select(owner: string | null) {
    if (owner !== null && (!owner || owner.length > 256)) throw new Error('Invalid local account ID');
    this.directoryFor(owner);
    this.index.activeOwner = owner;
    this.persist();
    return this.directory;
  }
  private persist() {
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.index), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
}
