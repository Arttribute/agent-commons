import { BadRequestException, Injectable } from '@nestjs/common';
import { build, type Loader, type Message, type Plugin } from 'esbuild';
import { posix } from 'node:path';
import type { BuildResult, CodeProjectFileInput } from './code-project.types';

const ALLOWED_IMPORTS: Record<string, string> = {
  react: 'https://esm.sh/react@19.0.0',
  'react/jsx-runtime': 'https://esm.sh/react@19.0.0/jsx-runtime',
  'react/jsx-dev-runtime': 'https://esm.sh/react@19.0.0/jsx-dev-runtime',
  'react-dom': 'https://esm.sh/react-dom@19.0.0?external=react',
  'react-dom/client': 'https://esm.sh/react-dom@19.0.0/client?external=react',
  'lucide-react':
    'https://esm.sh/lucide-react@0.474.0?external=react,react-dom',
  'framer-motion':
    'https://esm.sh/framer-motion@12.0.11?external=react,react-dom',
  recharts: 'https://esm.sh/recharts@2.15.3?external=react,react-dom',
  clsx: 'https://esm.sh/clsx@2.1.1',
  'tailwind-merge': 'https://esm.sh/tailwind-merge@3.0.1',
};

const LOADERS: Record<string, Loader> = {
  '.js': 'jsx',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.css': 'css',
  '.json': 'json',
  '.svg': 'dataurl',
  '.png': 'dataurl',
  '.jpg': 'dataurl',
  '.jpeg': 'dataurl',
  '.gif': 'dataurl',
  '.webp': 'dataurl',
};

const RESOLVE_EXTENSIONS = Object.keys(LOADERS);

@Injectable()
export class CodeProjectBuilder {
  async build(args: {
    name: string;
    entryFile: string;
    files: CodeProjectFileInput[];
  }): Promise<BuildResult> {
    const files = new Map(args.files.map((file) => [file.path, file.content]));
    const resolvedEntry = resolveProjectFile(files, args.entryFile);
    const nextEntry = '__agent_commons_entry.tsx';
    if (resolvedEntry === 'app/page.tsx') {
      files.set(nextEntry, `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport Page from './app/page';\ncreateRoot(document.getElementById('root')!).render(<Page />);`);
    }
    const entryFile = resolvedEntry === 'app/page.tsx' ? nextEntry : resolvedEntry;
    if (!entryFile) {
      throw new BadRequestException(`Entry file not found: ${args.entryFile}`);
    }

    try {
      const result = await build({
        absWorkingDir: '/',
        bundle: true,
        entryPoints: [entryFile],
        entryNames: 'assets/app',
        assetNames: 'assets/[name]-[hash]',
        chunkNames: 'assets/chunk-[hash]',
        outdir: '/prototype-dist',
        write: false,
        format: 'esm',
        platform: 'browser',
        target: ['es2022'],
        jsx: 'automatic',
        minify: true,
        sourcemap: false,
        splitting: false,
        logLevel: 'silent',
        plugins: [virtualProjectPlugin(files)],
      });

      const outputAssets = result.outputFiles.map((file) => {
        const path = file.path.replace('/prototype-dist/', '');
        return {
          path,
          content: file.contents,
          contentType: contentTypeFor(path),
          cacheControl: 'public, max-age=31536000, immutable',
        };
      });
      const js = outputAssets.find((asset) => asset.path.endsWith('.js'));
      if (!js) throw new Error('Build did not produce a JavaScript entry');
      const css = outputAssets.find((asset) => asset.path.endsWith('.css'));
      const html = renderHtml({
        name: args.name,
        jsPath: js.path,
        cssPath: css?.path,
      });
      const assets = [
        {
          path: 'index.html',
          content: html,
          contentType: 'text/html; charset=utf-8',
          cacheControl: 'no-cache, no-store, must-revalidate',
        },
        ...outputAssets,
      ];
      return {
        assets,
        bytes: assets.reduce(
          (total, asset) =>
            total +
            (typeof asset.content === 'string'
              ? Buffer.byteLength(asset.content)
              : asset.content.byteLength),
          0,
        ),
        warnings: result.warnings.map(formatMessage),
      };
    } catch (error: any) {
      if (Array.isArray(error?.errors)) {
        throw new BadRequestException({
          code: 'project_build_failed',
          message: 'The project could not be compiled',
          errors: error.errors.map(formatMessage),
        });
      }
      throw error;
    }
  }
}

function virtualProjectPlugin(files: Map<string, string>): Plugin {
  return {
    name: 'agent-commons-code-project',
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return { path: args.path, namespace: 'project' };
        }
        if (isBareImport(args.path)) {
          if (
            !Object.prototype.hasOwnProperty.call(ALLOWED_IMPORTS, args.path)
          ) {
            return {
              errors: [
                {
                  text: `Package "${args.path}" is not available in lightweight prototypes`,
                },
              ],
            };
          }
          return { path: args.path, external: true };
        }
        if (/^(https?:|data:|node:)/i.test(args.path)) {
          return {
            errors: [{ text: 'Remote and Node.js imports are not allowed' }],
          };
        }
        const candidate = posix.normalize(
          posix.join(args.resolveDir, args.path),
        );
        const resolved = resolveProjectFile(files, candidate);
        if (!resolved) {
          return { errors: [{ text: `Could not resolve "${args.path}"` }] };
        }
        return { path: resolved, namespace: 'project' };
      });

      buildApi.onLoad({ filter: /.*/, namespace: 'project' }, (args) => {
        const contents = files.get(args.path);
        if (contents === undefined) {
          return { errors: [{ text: `Project file not found: ${args.path}` }] };
        }
        const extension = posix.extname(args.path).toLowerCase();
        const loader = LOADERS[extension];
        if (!loader) {
          return { errors: [{ text: `Unsupported file type: ${extension}` }] };
        }
        return {
          contents,
          loader,
          resolveDir: posix.dirname(args.path),
        };
      });
    },
  };
}

function resolveProjectFile(files: Map<string, string>, requested: string) {
  const clean = requested.replace(/^\.\//, '').replace(/^\//, '');
  const candidates = [
    clean,
    ...RESOLVE_EXTENSIONS.map((extension) => `${clean}${extension}`),
    ...RESOLVE_EXTENSIONS.map((extension) =>
      posix.join(clean, `index${extension}`),
    ),
  ];
  return candidates.find((candidate) => files.has(candidate));
}

function isBareImport(path: string) {
  return !path.startsWith('.') && !path.startsWith('/');
}

function formatMessage(message: Message) {
  return {
    message: message.text,
    file: message.location?.file,
    line: message.location?.line,
    column: message.location?.column,
  };
}

function contentTypeFor(path: string) {
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function renderHtml(args: { name: string; jsPath: string; cssPath?: string }) {
  const importMap = JSON.stringify({ imports: ALLOWED_IMPORTS });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="data:," />
    <title>${escapeHtml(args.name)}</title>
    ${args.cssPath ? `<link rel="stylesheet" href="./${args.cssPath}" />` : ''}
    <script type="importmap">${importMap}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${args.jsPath}"></script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
