import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
await mkdir('.test-build', { recursive: true });
await build({
  entryPoints: ['test/launch.test.ts', 'test/tools.test.ts', 'test/chat.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: '.test-build',
  target: 'node22',
});
await build({
  entryPoints: ['src/runtime.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: '.test-build/runtime.cjs',
  target: 'node22',
  alias: {
    '@agent-commons/sdk': fileURLToPath(new URL('../../commons-sdk/src/index.ts', import.meta.url)),
  },
});
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '.test-build/launch.test.js',
    '.test-build/tools.test.js',
    '.test-build/chat.test.js',
    'test/runtime.test.cjs',
  ],
  { stdio: 'inherit' }
);
process.exitCode = result.status ?? 1;
