import { BadRequestException } from '@nestjs/common';
import { CodeProjectBuilder } from './code-project.builder';

describe('CodeProjectBuilder', () => {
  const builder = new CodeProjectBuilder();

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
    expect(String(html?.content)).toContain('type="importmap"');
    expect(String(html?.content)).toContain('Small prototype');
    expect(result.assets.some((asset) => asset.path.endsWith('.js'))).toBe(
      true,
    );
    expect(result.assets.some((asset) => asset.path.endsWith('.css'))).toBe(
      true,
    );
    expect(result.bytes).toBeGreaterThan(100);
  });

  it('rejects packages outside the lightweight allowlist', async () => {
    await expect(
      builder.build({
        name: 'Unsafe prototype',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import childProcess from 'node:child_process'; console.log(childProcess);`,
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
        { path: 'app/page.tsx', content: `'use client'; import './globals.css'; export default function Page() { return <main>Next works</main>; }` },
        { path: 'app/globals.css', content: `body { background: white; color: black; }` },
      ],
    });
    expect(result.assets.some((asset) => asset.path.endsWith('.js'))).toBe(true);
    expect(result.assets.some((asset) => asset.path.endsWith('.css'))).toBe(true);
  });

  it('returns a bounded build error for missing local files', async () => {
    await expect(
      builder.build({
        name: 'Broken prototype',
        entryFile: 'src/main.tsx',
        files: [
          {
            path: 'src/main.tsx',
            content: `import './missing';`,
          },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'project_build_failed' } });
  });
});
