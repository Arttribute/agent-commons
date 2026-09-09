import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
await mkdir('.test-build', { recursive: true });
await build({ entryPoints: ['test/launch.test.ts', 'test/tools.test.ts'], bundle: true, platform: 'node', format: 'cjs', outdir: '.test-build', target: 'node22' });
const result = spawnSync(process.execPath, ['--test', '.test-build/launch.test.js', '.test-build/tools.test.js'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
