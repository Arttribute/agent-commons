import { BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import { isBinarySiteFile } from '../code-project/site-files';
import { validateFiles } from '../code-project/code-project.service';
import type { CodeProjectFileInput } from '../code-project/code-project.types';
const ALLOWED =
  /\.(html?|css|m?js|json|webmanifest|xml|txt|svg|png|jpe?g|webp|avif|gif|ico|woff2?|ttf|otf|pdf|mp4|webm)$/i;
const LIMIT = 8_000_000;
export async function importStaticBuild(
  bytes: Buffer,
): Promise<CodeProjectFileInput[]> {
  if (!bytes?.length || bytes.length > LIMIT)
    throw new BadRequestException('Upload a ZIP of at most 8 MB');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new BadRequestException('The file is not a readable ZIP archive');
  }
  const entries = Object.values(zip.files).filter(
    (f) =>
      !f.dir &&
      !f.name.startsWith('__MACOSX/') &&
      !f.name.endsWith('/.DS_Store') &&
      f.name !== '.DS_Store',
  );
  if (entries.length > 400)
    throw new BadRequestException('A web build can contain at most 400 files');
  for (const entry of entries) {
    const original =
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string })
        .unsafeOriginalName ?? entry.name;
    if (
      original !== entry.name ||
      /[\\\0?#:]/.test(original) ||
      original.startsWith('/') ||
      original
        .split('/')
        .some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))
    )
      throw new BadRequestException(`Unsafe archive path: ${original}`);
    if (
      !ALLOWED.test(original) ||
      /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(original)
    )
      throw new BadRequestException(
        `Export the built website only; unsupported file: ${original}`,
      );
    if (
      typeof entry.unixPermissions === 'number' &&
      (entry.unixPermissions & 0o170000) === 0o120000
    )
      throw new BadRequestException(
        'Symbolic links are not allowed in a web build',
      );
  }
  let prefix = '';
  if (!entries.some((e) => e.name === 'index.html')) {
    const candidates = entries
      .filter((e) => e.name.endsWith('/index.html'))
      .map((e) => e.name.slice(0, -'index.html'.length))
      .filter((p) => entries.every((e) => e.name.startsWith(p)));
    if (candidates.length !== 1)
      throw new BadRequestException(
        'ZIP the contents of your export / dist folder, with index.html at its root',
      );
    prefix = candidates[0];
  }
  let total = 0;
  const files: CodeProjectFileInput[] = [];
  for (const entry of entries) {
    const data = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let stopped = false;
      const stream = entry.nodeStream('nodebuffer');
      stream.on('data', (chunk) => {
        if (stopped) return;
        size += chunk.length;
        total += chunk.length;
        if (size > 3_000_000 || total > 8_000_000) {
          stopped = true;
          stream.pause();
          reject(
            new BadRequestException(
              'The expanded web build exceeds its 8 MB total / 3 MB per-file limit',
            ),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.on('error', () => {
        stopped = true;
        reject(
          new BadRequestException('The archive contains an unreadable asset'),
        );
      });
      stream.on('end', () => {
        if (!stopped) resolve(Buffer.concat(chunks));
      });
      stream.resume();
    });
    const path = entry.name.slice(prefix.length);
    try {
      files.push({
        path,
        content: isBinarySiteFile(path)
          ? 'base64:' + data.toString('base64')
          : new TextDecoder('utf-8', { fatal: true }).decode(data),
      });
    } catch {
      throw new BadRequestException(`Text asset ${path} must use UTF-8`);
    }
  }
  if (!files.some((f) => f.path === 'index.html'))
    throw new BadRequestException('A web build needs index.html');
  return validateFiles(files, 'static');
}
