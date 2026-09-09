import { build } from 'esbuild';
import { mkdir, readFile, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const cliRoot = dirname(require.resolve('@agent-commons/cli/package.json'));
const cli = JSON.parse(await readFile(join(cliRoot, 'package.json'), 'utf8'));
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: 'dist/extension.js',
});
// Bundle the exact workspace CLI; installs never download or execute npx packages.
await build({
  entryPoints: [join(cliRoot, 'src/bin.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/cli.cjs',
  define: { __CLI_VERSION__: JSON.stringify(cli.version) },
  alias: { '@agent-commons/sdk': join(cliRoot, '../commons-sdk/src/index.ts') },
});
// pdf-parse loads this worker dynamically relative to its entry point.
const cliRequire = createRequire(join(cliRoot, 'package.json'));
const pdfRoot = dirname(cliRequire.resolve('pdf-parse/package.json'));
// Keep the path expected by pdf-parse's dynamic require.
await mkdir('dist/pdf.js/v1.10.100/build', { recursive: true });
await copyFile(
  join(pdfRoot, 'lib/pdf.js/v1.10.100/build/pdf.js'),
  'dist/pdf.js/v1.10.100/build/pdf.js'
);

await build({
  entryPoints: ['src/runtime.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/runtime.cjs',
  alias: { '@agent-commons/sdk': join(cliRoot, '../commons-sdk/src/index.ts') },
});
