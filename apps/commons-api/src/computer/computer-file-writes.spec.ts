import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerFileWriteCommands } from './computer-file-writes';

describe('deterministic computer file writes', () => {
  const run = (commands: ReturnType<typeof computerFileWriteCommands>, cwd: string) => {
    for (const { command, marker } of commands) {
      expect(Buffer.byteLength(command)).toBeLessThan(90_000);
      expect(execFileSync('/bin/sh', ['-c', command], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).toContain(marker);
    }
  };
  it('executes exact text, nested paths and chunked Unicode without interpreting filenames or content as shell', () => {
    const folder = mkdtempSync(join(tmpdir(), 'commons-computer-write-'));
    try {
      const files = [{ path: 'reports/analysis.py', content: 'print("real bootstrap")\n' }, { path: 'large.txt', content: '🟩 factual inputs\n'.repeat(12_000) }, { path: 'empty.txt', content: '' }, { path: 'literal $(touch UNEXPECTED).txt', content: '`echo ignored` $HOME\n' }];
      run(computerFileWriteCommands(files), folder);
      for (const file of files) expect(readFileSync(join(folder, file.path), 'utf8')).toBe(file.content);
      expect(() => readFileSync(join(folder, 'UNEXPECTED'))).toThrow();
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('blocks traversal and symlink writes while preserving the external file', () => {
    const folder = mkdtempSync(join(tmpdir(), 'commons-computer-write-boundary-'));
    const output = join(folder, 'source.txt');
    try {
      writeFileSync(output, 'original'); symlinkSync(output, join(folder, 'alias.txt'));
      for (const path of ['../outside.txt', 'alias.txt']) {
        expect(() => run(computerFileWriteCommands([{ path, content: 'replacement' }]), folder)).toThrow();
      }
      expect(readFileSync(output, 'utf8')).toBe('original');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});
