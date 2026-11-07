import JSZip from 'jszip';
import { importStaticBuild } from './static-import';
import { buildStaticSite } from '../code-project/site-files';

describe('bring-your-own browser build', () => {
  async function archive(files: Record<string, string | Buffer>) {
    const zip = new JSZip();
    Object.entries(files).forEach(([path, content]) => zip.file(path, content));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  it('imports a dist wrapper, preserves binary bytes and fixes nested / root asset URLs', async () => {
    const png = Buffer.from([137, 80, 78, 71, 0, 255]);
    const files = await importStaticBuild(
      await archive({
        'dist/index.html':
          '<script src="/assets/app.js"></script><img src="./assets/image.png">',
        'dist/assets/app.js': 'import("./chunk.js")',
        'dist/assets/chunk.js': 'export default 1',
        'dist/assets/image.png': png,
      }),
    );
    const built = buildStaticSite(
      files,
      'https://api.example/v1/previews/site/deployments/version/',
    );
    expect(
      built.assets.find((f) => f.path === 'assets/image.png')?.content,
    ).toEqual(png);
    expect(
      built.assets.find((f) => f.path === 'index.html')?.content,
    ).toContain(
      'https://api.example/v1/previews/site/deployments/version/assets/app.js',
    );
    expect(
      built.assets.find((f) => f.path === 'assets/app.js')?.content,
    ).toContain(
      'https://api.example/v1/previews/site/deployments/version/assets/chunk.js',
    );
  });
  it.each([
    '../index.html',
    '/index.html',
    '.env.txt',
    'assets/.secret.txt',
    'api/server.ts',
    'node_modules/pkg.js',
  ])('rejects unsafe / server source %s', async (path) => {
    await expect(
      importStaticBuild(
        await archive({ 'index.html': '<html></html>', [path]: 'secret' }),
      ),
    ).rejects.toThrow();
  });
  it('bounds expanded data even when it compresses to a tiny ZIP', async () => {
    await expect(
      importStaticBuild(
        await archive({
          'index.html': '<html></html>',
          'huge.txt': 'a'.repeat(3_000_001),
        }),
      ),
    ).rejects.toThrow('expanded');
  });
  it('rejects symlinks, invalid UTF-8 and source with no entry', async () => {
    const zip = new JSZip();
    zip.file('index.html', 'hello');
    zip.file('asset.txt', '../../secret', { unixPermissions: 0o120777 });
    await expect(
      importStaticBuild(
        await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }),
      ),
    ).rejects.toThrow('Symbolic');
    await expect(
      importStaticBuild(await archive({ 'index.html': Buffer.from([255]) })),
    ).rejects.toThrow('UTF-8');
    await expect(
      importStaticBuild(await archive({ 'app.js': 'hello' })),
    ).rejects.toThrow('index.html');
  });
  it('also rejects private/server paths when the static builder is used without ZIP import', () => {
    expect(() =>
      buildStaticSite([
        { path: 'index.html', content: 'hi' },
        { path: '.env.txt', content: 'private' },
      ]),
    ).toThrow();
  });
});
