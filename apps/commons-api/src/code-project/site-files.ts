import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import type { BuildResult, CodeProjectFileInput } from './code-project.types';

const BINARY = /\.(png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf|mp4|webm)$/i;
export const isStaticSitePath = (path: string) =>
  /\.(html?|css|m?js|json|webmanifest|xml|txt|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf|mp4|webm)$/i.test(
    path,
  ) &&
  !/[\\\0?#:]/.test(path) &&
  !path.startsWith('/') &&
  path
    .split('/')
    .every(
      (part) => !!part && !part.startsWith('.') && part !== 'node_modules',
    );
export const isBinarySiteFile = (path: string) => BINARY.test(path);
export function decodeSiteFile(
  file: CodeProjectFileInput,
): Uint8Array | string {
  if (!isBinarySiteFile(file.path)) return file.content;
  const encoded = file.content.startsWith('base64:')
    ? file.content.slice(7)
    : '';
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new BadRequestException(
      `Binary asset ${file.path} must use base64: content`,
    );
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded)
    throw new BadRequestException(`Invalid base64 asset: ${file.path}`);
  return bytes;
}
export function siteContentType(path: string) {
  const ext = posix.extname(path).toLowerCase();
  return (
    (
      {
        '.html': 'text/html; charset=utf-8',
        '.htm': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
        '.xml': 'application/xml',
        '.txt': 'text/plain; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.avif': 'image/avif',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.otf': 'font/otf',
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      } as Record<string, string>
    )[ext] ?? 'application/octet-stream'
  );
}
/** Copies an already-built frontend. No imported JavaScript runs on the server. */
export function buildStaticSite(
  files: CodeProjectFileInput[],
  publicBaseUrl?: string,
): BuildResult {
  if (files.some((f) => !isStaticSitePath(f.path)))
    throw new BadRequestException(
      'Only exported browser assets are allowed in a static site',
    );
  const paths = new Set(files.map((f) => f.path));
  if (!paths.has('index.html'))
    throw new BadRequestException(
      'The web build must contain index.html at its root',
    );
  const base = publicBaseUrl?.replace(/\/?$/, '/');
  const assets = files.map((file) => {
    let content = decodeSiteFile(file);
    if (
      typeof content === 'string' &&
      base &&
      /\.(html?|css|m?js|json|webmanifest)$/i.test(file.path)
    ) {
      // Rewrite only references that name another supplied asset. Routes and
      // external APIs remain untouched; imports inside chunks retain their own directory.
      content = content.replace(
        /(["'`(])([^"'`<>\s)]+)(["'`)])/g,
        (whole, before, reference, after) => {
          if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(reference)) return whole;
          const match = /^([^?#]+)([?#].*)?$/.exec(reference);
          if (!match) return whole;
          const raw = match[1];
          const candidates = raw.startsWith('/')
            ? [raw.slice(1)]
            : [
                posix.normalize(posix.join(posix.dirname(file.path), raw)),
                raw.replace(/^\.\//, ''),
              ];
          const path = candidates.find((candidate) => paths.has(candidate));
          return path
            ? `${before}${base}${path}${match[2] ?? ''}${after}`
            : whole;
        },
      );
    }
    if (file.path === 'index.html' && typeof content === 'string') {
      const runtime = '<meta name="agent-commons-runtime" content="2">';
      content = /<head\b[^>]*>/i.test(content)
        ? content.replace(/<head\b[^>]*>/i, (tag) => tag + runtime)
        : runtime + content;
    }
    return {
      path: file.path,
      content,
      contentType: siteContentType(file.path),
      cacheControl: file.path.endsWith('.html')
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=31536000, immutable',
    };
  });
  return {
    assets,
    bytes: assets.reduce(
      (n, a) =>
        n +
        (typeof a.content === 'string'
          ? Buffer.byteLength(a.content)
          : a.content.byteLength),
      0,
    ),
    warnings: [],
  };
}
