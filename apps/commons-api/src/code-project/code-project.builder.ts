import { BadRequestException, Injectable } from '@nestjs/common';
import { build, type Loader, type Message, type Plugin } from 'esbuild';
import { posix } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import type { BuildResult, CodeProjectFileInput } from './code-project.types';
import {
  COMMONS_UI_MODULE,
  COMMONS_UI_RUNTIME_SOURCE,
  COMMONS_UI_STYLES,
} from './code-project.ui-runtime';

const ALLOWED_IMPORTS = new Set([
  COMMONS_UI_MODULE,
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'lucide-react',
  'framer-motion',
  'recharts',
  'clsx',
  'tailwind-merge',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-select',
  '@radix-ui/react-tabs',
  '@radix-ui/react-tooltip',
  '@react-three/fiber',
  'three',
  'phaser',
]);

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
  '.woff': 'file',
  '.woff2': 'file',
  '.ttf': 'file',
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
      files.set(
        nextEntry,
        `import React from 'react';\nimport { createRoot } from 'react-dom/client';\n${files.has('app/globals.css') ? "import './app/globals.css';\n" : ''}import Page from './app/page';\ncreateRoot(document.getElementById('root')!).render(<Page />);`,
      );
    }
    const entryFile =
      resolvedEntry === 'app/page.tsx' ? nextEntry : resolvedEntry;
    if (!entryFile) {
      throw new BadRequestException(`Entry file not found: ${args.entryFile}`);
    }

    try {
      const result = await build({
        absWorkingDir: process.cwd(),
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
        loader: LOADERS,
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
      const projectCss = css ? Buffer.from(css.content).toString('utf8') : '';
      const commonsCss = await compileCommonsStyles(files, projectCss);
      assertVisualSource(files, projectCss, commonsCss);
      const commonsCssAsset = {
        path: 'assets/commons-ui.css',
        content: commonsCss,
        contentType: 'text/css; charset=utf-8',
        cacheControl: 'public, max-age=31536000, immutable',
      };
      const html = renderHtml({
        name: args.name,
        jsPath: js.path,
        cssPaths: [commonsCssAsset.path],
      });
      const assets = [
        {
          path: 'index.html',
          content: html,
          contentType: 'text/html; charset=utf-8',
          cacheControl: 'no-cache, no-store, must-revalidate',
        },
        commonsCssAsset,
        ...outputAssets.filter((asset) => asset !== css),
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
        return undefined;
      });
      buildApi.onResolve(
        { filter: /.*/, namespace: 'project' },
        async (args) => {
          if (isBareImport(args.path)) {
            if (!isAllowedImport(args.path)) {
              return {
                errors: [
                  {
                    text: `Package "${args.path}" is not available in lightweight prototypes`,
                  },
                ],
              };
            }
            if (args.path === COMMONS_UI_MODULE) {
              return { path: COMMONS_UI_MODULE, namespace: 'commons-ui' };
            }
            return buildApi.resolve(args.path, {
              kind: args.kind,
              resolveDir: process.cwd(),
            });
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
        },
      );

      buildApi.onLoad({ filter: /.*/, namespace: 'commons-ui' }, () => ({
        contents: COMMONS_UI_RUNTIME_SOURCE,
        loader: 'tsx',
        resolveDir: process.cwd(),
      }));

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
          resolveDir: posix.join('/', posix.dirname(args.path)),
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

function isAllowedImport(path: string) {
  return ALLOWED_IMPORTS.has(path) || path.startsWith('three/');
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
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

function renderHtml(args: {
  name: string;
  jsPath: string;
  cssPaths: string[];
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="agent-commons-runtime" content="2" />
    <link rel="icon" href="data:," />
    <title>${escapeHtml(args.name)}</title>
    ${args.cssPaths.map((path) => `<link rel="stylesheet" href="./${path}" />`).join('\n    ')}
    <script>
      (() => {
        const query = new URLSearchParams(window.location.search);
        document.documentElement.dataset.commonsSurface = query.get('commonsSurface') === 'widget' ? 'widget' : 'page';
        document.documentElement.dataset.theme = query.get('commonsTheme') === 'dark' ? 'dark' : 'light';
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${args.jsPath}"></script>
  </body>
</html>`;
}

async function compileCommonsStyles(
  files: Map<string, string>,
  projectCss: string,
) {
  const source = [...files.entries()]
    .filter(([path]) => /\.(?:[jt]sx?|html|mdx?)$/i.test(path))
    .map(([, content]) => content)
    .concat(COMMONS_UI_RUNTIME_SOURCE)
    .join('\n');
  const result = await postcss([
    tailwindcss({
      content: [{ raw: source, extension: 'tsx' }],
      darkMode: ['class', '[data-theme="dark"]'],
      theme: {
        extend: {
          colors: {
            page: '#fcfcfb',
            background: 'hsl(var(--background) / <alpha-value>)',
            foreground: 'hsl(var(--foreground) / <alpha-value>)',
            card: 'hsl(var(--card) / <alpha-value>)',
            'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
            popover: 'hsl(var(--popover) / <alpha-value>)',
            'popover-foreground':
              'hsl(var(--popover-foreground) / <alpha-value>)',
            secondary: 'hsl(var(--secondary) / <alpha-value>)',
            'secondary-foreground':
              'hsl(var(--secondary-foreground) / <alpha-value>)',
            muted: 'hsl(var(--muted) / <alpha-value>)',
            'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
            border: 'hsl(var(--border) / <alpha-value>)',
            input: 'hsl(var(--input) / <alpha-value>)',
            primary: 'hsl(var(--primary) / <alpha-value>)',
            'primary-foreground':
              'hsl(var(--primary-foreground) / <alpha-value>)',
            accent: 'hsl(var(--accent) / <alpha-value>)',
            'accent-foreground':
              'hsl(var(--accent-foreground) / <alpha-value>)',
            destructive: 'hsl(var(--destructive) / <alpha-value>)',
            'destructive-foreground':
              'hsl(var(--destructive-foreground) / <alpha-value>)',
            ring: 'hsl(var(--ring) / <alpha-value>)',
            'brand-yellow': 'var(--brand-yellow)',
            'brand-pink': 'var(--brand-pink)',
            'brand-mint': 'var(--brand-mint)',
            'brand-cyan': 'var(--brand-cyan)',
            'brand-blue': 'var(--brand-blue)',
            'brand-lilac': 'var(--brand-lilac)',
            'chart-1': 'hsl(var(--chart-1) / <alpha-value>)',
            'chart-2': 'hsl(var(--chart-2) / <alpha-value>)',
            'chart-3': 'hsl(var(--chart-3) / <alpha-value>)',
            'chart-4': 'hsl(var(--chart-4) / <alpha-value>)',
            'chart-5': 'hsl(var(--chart-5) / <alpha-value>)',
          },
          borderRadius: {
            lg: 'var(--radius)',
            md: 'calc(var(--radius) - 2px)',
            sm: 'calc(var(--radius) - 4px)',
          },
          boxShadow: {
            composer:
              '0 12px 32px -12px rgba(28, 25, 23, .14), 0 4px 12px -4px rgba(28, 25, 23, .08), 0 1px 3px rgba(28, 25, 23, .05)',
            card: '0 2px 8px -2px rgba(28, 25, 23, .06), 0 1px 2px rgba(28, 25, 23, .04)',
            floating:
              '0 8px 24px -8px rgba(28, 25, 23, .12), 0 2px 6px -2px rgba(28, 25, 23, .05)',
          },
          fontFamily: {
            sans: [
              'Space Grotesk Variable',
              'Space Grotesk',
              'Helvetica',
              'Arial',
              'sans-serif',
            ],
            mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
          },
        },
      },
      plugins: [],
    }),
  ]).process(
    `${COMMONS_UI_STYLES}\n${projectCss.replace(/@tailwind\s+(?:base|components|utilities)\s*;/gi, '')}`,
    { from: undefined },
  );
  return result.css;
}

const COMMONS_UI_VISUAL_PRIMITIVES = new Set([
  'AppShell',
  'PageHeader',
  'Card',
  'Button',
  'Badge',
  'MetricCard',
  'EmptyState',
  'Skeleton',
  'ScrollArea',
]);

function assertVisualSource(
  files: Map<string, string>,
  projectCss: string,
  compiledCss: string,
) {
  const source = [...files.values()].join('\n');
  const hasAuthoredCss = hasEffectiveCssRule(projectCss);
  const rendersCommonsUi = rendersCommonsUiPrimitive(source);
  const hasEffectiveClass = extractStaticClassTokens(source).some((token) =>
    stylesheetContainsClass(compiledCss, token),
  );
  if (!hasAuthoredCss && !rendersCommonsUi && !hasEffectiveClass) {
    throw new BadRequestException({
      code: 'project_styles_required',
      message:
        'UI projects need effective styling. Add compiled Tailwind className values, render @agent-commons/ui primitives, or import a stylesheet with authored rules.',
    });
  }
}

function hasEffectiveCssRule(projectCss: string) {
  if (!projectCss.trim()) return false;
  try {
    let declarations = 0;
    postcss.parse(projectCss).walkDecls(() => {
      declarations += 1;
    });
    return declarations > 0;
  } catch {
    return false;
  }
}

function rendersCommonsUiPrimitive(source: string) {
  const namedImports =
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]@agent-commons\/ui['"]/g;
  for (const match of source.matchAll(namedImports)) {
    for (const specifier of (match[1] || '').split(',')) {
      const parts = specifier
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/);
      const imported = parts[0]?.trim();
      const local = parts.at(-1)?.trim();
      if (
        imported &&
        local &&
        COMMONS_UI_VISUAL_PRIMITIVES.has(imported) &&
        new RegExp(`<\\s*${escapeRegExp(local)}(?:[\\s/>])`).test(source)
      ) {
        return true;
      }
    }
  }

  const namespaceImports =
    /import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]@agent-commons\/ui['"]/g;
  for (const match of source.matchAll(namespaceImports)) {
    const namespace = match[1];
    if (!namespace) continue;
    for (const primitive of COMMONS_UI_VISUAL_PRIMITIVES) {
      if (
        new RegExp(
          `<\\s*${escapeRegExp(namespace)}\\.${primitive}(?:[\\s/>])`,
        ).test(source)
      ) {
        return true;
      }
    }
  }
  return false;
}

function extractStaticClassTokens(source: string) {
  const tokens = new Set<string>();
  const attributes = /\bclass(?:Name)?\s*=\s*(?:\{\s*)?(['"`])([\s\S]*?)\1/g;
  for (const match of source.matchAll(attributes)) {
    for (const token of (match[2] || '').split(/\s+/)) {
      if (token && !token.includes('${')) tokens.add(token);
    }
  }
  return [...tokens];
}

function stylesheetContainsClass(stylesheet: string, token: string) {
  const escaped = token.replace(/[^a-zA-Z0-9_-]/g, (character) =>
    character === ',' ? '\\2c ' : `\\${character}`,
  );
  const needle = `.${escaped}`;
  let cursor = stylesheet.indexOf(needle);
  while (cursor !== -1) {
    const next = stylesheet[cursor + needle.length];
    if (!next || /[\s,{.:#>+~\[]/.test(next)) return true;
    cursor = stylesheet.indexOf(needle, cursor + needle.length);
  }
  return false;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
