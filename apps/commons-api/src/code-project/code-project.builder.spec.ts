import { BadRequestException } from '@nestjs/common';
import { CodeProjectBuilder } from './code-project.builder';

describe('CodeProjectBuilder', () => {
  const builder = new CodeProjectBuilder();

  describe('image preloads', () => {
    const files = (page: string) => [
      { path: 'app/page.tsx', content: page },
      { path: 'assets/hero.webp', content: 'base64:UklGRgAAAABXRUJQ' },
      { path: 'assets/logo.png', content: 'base64:iVBORw0KGgo=' },
      {
        path: 'app/globals.css',
        content: 'body{margin:0;background:white}img{max-width:100%}',
      },
    ];
    const text = (content: string | Uint8Array) =>
      typeof content === 'string' ? content : Buffer.from(content).toString();

    it('starts an opted-in image with the script and leaves other images alone', async () => {
      const built = await builder.build({
        name: 'Preload test',
        entryFile: 'app/page.tsx',
        files: files(
          `import './globals.css'; import hero from '../assets/hero.webp?preload'; import again from '../assets/hero.webp'; import logo from '../assets/logo.png'; export default function Page(){return <main><img src={hero} alt="Hero"/><img src={again} alt=""/><img src={logo} alt="Logo"/></main>}`,
        ),
      });
      const html = text(
        built.assets.find((asset) => asset.path === 'index.html')!.content,
      );
      const hero = built.assets.filter((asset) => asset.path.endsWith('.webp'));
      // Both import forms share one emitted file.
      expect(hero).toHaveLength(1);
      expect(html).toContain(
        `<link rel="preload" as="image" href="./${hero[0].path}" fetchpriority="high" />`,
      );
      expect(html.match(/rel="preload"/g)).toHaveLength(1);
      const javascript = text(
        built.assets.find((asset) => asset.path.endsWith('.js'))!.content,
      );
      expect(javascript).toContain(`./${hero[0].path}`);

      const inline = await builder.buildInlinePreview({
        name: 'Preload test',
        entryFile: 'app/page.tsx',
        files: files(
          `import './globals.css'; import hero from '../assets/hero.webp?preload'; export default function Page(){return <img src={hero} alt="Hero"/>}`,
        ),
      });
      expect(inline.html).not.toContain('<link rel="preload"');
    });

    it.each([
      `import x from 'react?preload'`,
      `import x from './globals.css?preload'`,
      `import x from '../assets/missing.webp?preload'`,
    ])('rejects a preload that is not a local image: %s', async (line) => {
      await expect(
        builder.build({
          name: 'Bad preload',
          entryFile: 'app/page.tsx',
          files: files(
            // esbuild drops unused TypeScript imports, so the page uses `x`.
            `import './globals.css'; ${line}; export default function Page(){return <main>{String(x)}</main>}`,
          ),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('keeps binary image imports relative to the HTML and usable in inline previews', async () => {
    const files = [
      {
        path: 'app/page.tsx',
        content: `import './globals.css'; import image from '../assets/mark.png'; export default function Page(){return <img src={image} alt="Mark"/>}`,
      },
      { path: 'assets/mark.png', content: 'base64:iVBORw0KGgo=' },
      { path: 'assets/font.ttf', content: 'base64:AAECAwQFBgc=' },
      {
        path: 'app/globals.css',
        content:
          '@font-face{font-family:Mark;src:url(../assets/font.ttf)}body{margin:0;background:white;font-family:Mark}img{max-width:100%;height:auto}',
      },
    ];
    const built = await builder.build({
      name: 'Image test',
      entryFile: 'app/page.tsx',
      files,
    });
    const image = built.assets.find((asset) => asset.path.endsWith('.png'))!;
    const javascript = built.assets.find((asset) =>
      asset.path.endsWith('.js'),
    )!;
    expect(
      typeof javascript.content === 'string'
        ? javascript.content
        : Buffer.from(javascript.content).toString(),
    ).toContain('./' + image.path);
    const inline = await builder.buildInlinePreview({
      name: 'Image test',
      entryFile: 'app/page.tsx',
      files,
    });
    expect(inline.html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(inline.html).toContain('data:font/ttf;base64,AAECAwQFBgc=');
  });

  it('bundles React, local modules, and CSS without executing project code', async () => {
    const result = await builder.build({
      name: 'Small prototype',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card } from './Card';
import './styles.css';
createRoot(document.getElementById('root')!).render(<Card />);`,
        },
        {
          path: 'src/Card.tsx',
          content: `export function Card() { return <button>Working prototype</button>; }`,
        },
        {
          path: 'src/styles.css',
          content: `button { color: white; background: black; }`,
        },
      ],
    });

    const html = result.assets.find((asset) => asset.path === 'index.html');
    expect(String(html?.content)).not.toContain('type="importmap"');
    expect(String(html?.content)).not.toContain('esm.sh');
    expect(String(html?.content)).toContain('href="./assets/commons-ui.css"');
    expect(String(html?.content)).toContain('Small prototype');
    expect(result.assets.some((asset) => asset.path.endsWith('.js'))).toBe(
      true,
    );
    expect(result.assets.some((asset) => asset.path.endsWith('.css'))).toBe(
      true,
    );
    expect(result.bytes).toBeGreaterThan(100);
  });

  it('compiles Tailwind utilities and bundles the Commons UI runtime and curated dependencies', async () => {
    const result = await builder.build({
      name: 'Commons dashboard',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sparkles } from 'lucide-react';
import { AppShell, Card } from '@agent-commons/ui';
function App() { return <AppShell><Card className="grid bg-primary text-primary-foreground"><Sparkles aria-hidden="true" />Compiled UI</Card></AppShell>; }
createRoot(document.getElementById('root')!).render(<App />);`,
        },
      ],
    });

    const commonsCss = result.assets.find(
      (asset) => asset.path === 'assets/commons-ui.css',
    );
    const javaScript = result.assets.find((asset) =>
      asset.path.endsWith('.js'),
    );
    const html = result.assets.find((asset) => asset.path === 'index.html');

    expect(String(commonsCss?.content)).toContain('.bg-primary');
    expect(String(commonsCss?.content)).toContain('.text-primary-foreground');
    expect(String(commonsCss?.content)).toContain('.grid');
    const bundledJavaScript = assetText(javaScript?.content);
    expect(bundledJavaScript).toContain('Compiled UI');
    expect(bundledJavaScript).not.toMatch(
      /from["'](?:@agent-commons\/ui|lucide-react)["']/,
    );
    expect(String(html?.content)).not.toContain('importmap');
  });

  it('accepts a native Commons UI project without authored CSS or utility classes', async () => {
    const result = await builder.build({
      name: 'Native Commons card',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell, Card, PageHeader } from '@agent-commons/ui';
function App() { return <AppShell><PageHeader title="Native project" /><Card>Commons primitives provide the styling.</Card></AppShell>; }
createRoot(document.getElementById('root')!).render(<App />);`,
        },
      ],
    });

    expect(
      assetText(
        result.assets.find((asset) => asset.path === 'assets/commons-ui.css')
          ?.content,
      ),
    ).toContain('.ac-card');
  });

  it('rejects a nonexistent class as the only styling signal', async () => {
    await expect(
      builder.build({
        name: 'Unstyled project',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import React from 'react';
import { createRoot } from 'react-dom/client';
function App() { return <main className="does-not-exist">No effective styles</main>; }
createRoot(document.getElementById('root')!).render(<App />);`,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'project_styles_required' } });
  });

  it('accepts compiled Tailwind utilities without a project stylesheet', async () => {
    const result = await builder.build({
      name: 'Tailwind-only project',
      entryFile: 'src/main.tsx',
      files: [
        {
          path: 'src/main.tsx',
          content: `import React from 'react';
import { createRoot } from 'react-dom/client';
function App() { return <main className="grid min-h-screen p-4">Tailwind styles</main>; }
createRoot(document.getElementById('root')!).render(<App />);`,
        },
      ],
    });

    const compiledCss = assetText(
      result.assets.find((asset) => asset.path === 'assets/commons-ui.css')
        ?.content,
    );
    expect(compiledCss).toContain('.min-h-screen');
    expect(compiledCss).toContain('.p-4');
  });

  it('rejects a blank or comment-only project stylesheet', async () => {
    await expect(
      builder.build({
        name: 'Blank stylesheet project',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
function App() { return <main>No effective styles</main>; }
createRoot(document.getElementById('root')!).render(<App />);`,
          },
          {
            path: 'src/styles.css',
            content: '/* Styling will be added later. */',
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'project_styles_required' } });
  });

  it('rejects an unused Commons UI import as the only styling signal', async () => {
    await expect(
      builder.build({
        name: 'Unused native import',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card } from '@agent-commons/ui';
function App() { return <main>No effective styles</main>; }
createRoot(document.getElementById('root')!).render(<App />);`,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'project_styles_required' } });
  });

  it('rejects packages outside the lightweight allowlist', async () => {
    await expect(
      builder.build({
        name: 'Unsafe prototype',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import childProcess from 'node:child_process'; export default function App() { return <main className="p-4">{String(childProcess)}</main>; }`,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('previews a Next.js App Router page through the safe browser compiler', async () => {
    const result = await builder.build({
      name: 'Next app',
      entryFile: 'app/page.tsx',
      files: [
        {
          path: 'app/page.tsx',
          content: `'use client'; export default function Page() { return <main className="next-shell">Next works</main>; }`,
        },
        {
          path: 'app/globals.css',
          content: `@tailwind base; @tailwind components; @tailwind utilities; .next-shell { @apply p-4 font-semibold; background: rgb(1, 2, 3); color: white; }`,
        },
      ],
    });
    expect(result.assets.some((asset) => asset.path.endsWith('.js'))).toBe(
      true,
    );
    expect(result.assets.some((asset) => asset.path.endsWith('.css'))).toBe(
      true,
    );
    const compiledCss = result.assets.find(
      (asset) => asset.path === 'assets/commons-ui.css',
    );
    expect(assetText(compiledCss?.content)).toContain('.next-shell');
    expect(assetText(compiledCss?.content)).toContain('#010203');
    expect(assetText(compiledCss?.content)).toContain('padding: 1rem');
    expect(assetText(compiledCss?.content)).toContain('font-weight: 600');
  });

  it('returns a bounded build error for missing local files', async () => {
    await expect(
      builder.build({
        name: 'Broken prototype',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import './missing'; export default function App() { return <main className="p-4">Broken</main>; }`,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'project_build_failed' } });
  });

  it('produces a self-contained sandbox document for React previews', async () => {
    const result = await builder.buildInlinePreview({
      name: 'Inline app',
      entryFile: 'app/page.tsx',
      files: [
        {
          path: 'app/page.tsx',
          content:
            'export default function Page(){return <button className="p-4">Interactive</button>}',
        },
      ],
    });

    expect(result.html).toContain('Content-Security-Policy');
    expect(result.html).toContain('<script type="module">');
    expect(result.html).toContain('<style>');
    expect(result.html).not.toContain(
      '<script type="module" src="./assets/app.js"></script>',
    );
    expect(result.html).not.toContain(
      '<link rel="stylesheet" href="./assets/commons-ui.css" />',
    );
  });

  it('compiles a TypeScript artifact into an interactive console document', async () => {
    const result = await builder.buildSingleFilePreview({
      name: 'calculation.ts',
      content: 'const total: number = 6 * 7; console.log(total);',
    });

    expect(result?.html).toContain('Interactive JavaScript output');
    expect(result?.html).toContain('console.log');
    expect(result?.html).not.toContain(': number');
  });
});

function assetText(content: string | Uint8Array | undefined) {
  if (typeof content === 'string') return content;
  return content ? Buffer.from(content).toString('utf8') : '';
}
