import { createHash, randomUUID } from 'node:crypto';

// Use CommonOS's deterministic terminal protocol. A prose instruction to write
// files can otherwise be handled as chat and return without executing a write.
export const COMPUTER_WRITE_CODE = String.raw`import base64, hashlib, json, os, sys
from pathlib import Path
root = Path.cwd().resolve()
payload = json.loads(base64.b64decode(sys.argv[1]))
for part in payload['parts']:
    target = root / part['path']
    if target.is_absolute() and not target.is_relative_to(root): raise RuntimeError('Invalid workspace path')
    if '..' in Path(part['path']).parts: raise RuntimeError('Invalid workspace path')
    for parent in [target, *target.parents]:
        if parent == root: break
        if parent.is_symlink(): raise RuntimeError('Workspace write contains a symbolic link')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.commons-write-' + part['id'])
    if temporary.is_symlink(): raise RuntimeError('Temporary write contains a symbolic link')
    with temporary.open('wb' if part['first'] else 'ab') as handle:
        handle.write(base64.b64decode(part['data']))
    if part['last']:
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != part['sha256']: raise RuntimeError('Workspace write integrity check failed')
        os.replace(temporary, target)
print(payload['marker'])
`;

export function computerFileWriteCommands(files: Array<{ path: string; content: string }>) {
  const parts: Array<{ path: string; id: string; data: string; first: boolean; last: boolean; sha256: string }> = [];
  for (const file of files) {
    const bytes = Buffer.from(file.content, 'utf8');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const id = randomUUID();
    for (let offset = 0; offset < Math.max(bytes.length, 1); offset += 16_000) {
      parts.push({ path: file.path, id, data: bytes.subarray(offset, offset + 16_000).toString('base64'), first: offset === 0, last: offset + 16_000 >= bytes.length, sha256 });
    }
  }
  const commands: Array<{ command: string; marker: string }> = [];
  let batch: typeof parts = [];
  const flush = () => {
    if (!batch.length) return;
    const marker = `COMMONS_WRITE_OK_${randomUUID()}`;
    const payload = Buffer.from(JSON.stringify({ marker, parts: batch })).toString('base64');
    // Both code and input are base64 literals, never interpolated shell text.
    const code = Buffer.from(COMPUTER_WRITE_CODE).toString('base64');
    commands.push({ command: `python3 -c 'import base64; exec(base64.b64decode("${code}"))' '${payload}'`, marker });
    batch = [];
  };
  for (const part of parts) {
    if (Buffer.byteLength(JSON.stringify([...batch, part])) > 48_000) flush();
    batch.push(part);
  }
  flush(); return commands;
}
