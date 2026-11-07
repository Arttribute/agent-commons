/** Offline, reproducible camp-page export. No account or deployment required. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import JSZip from 'jszip';
import { createPageFiles } from '../src/project-page/templates';
import { CodeProjectBuilder } from '../src/code-project/code-project.builder';

async function main() {
  const output = resolve(process.argv[2] || '.camp-page-preview');
  const files = createPageFiles('ai-kids-camp', {
    title: 'AI Kids Hacker Camp',
  });
  const built = await new CodeProjectBuilder().build({
    name: 'AI Kids Hacker Camp',
    entryFile: 'app/page.tsx',
    files,
  });
  const zip = new JSZip();
  for (const asset of built.assets) {
    const path = resolve(output, asset.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, asset.content);
    zip.file(asset.path, asset.content);
  }
  await writeFile(
    `${output}.zip`,
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  console.log(
    JSON.stringify({
      output,
      zip: `${output}.zip`,
      assets: built.assets.length,
      bytes: built.bytes,
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
