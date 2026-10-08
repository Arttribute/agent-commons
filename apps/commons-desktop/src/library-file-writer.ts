import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { readOutputPublicationState, saveOutputPublicationState } from './output-publication-state.ts';

export function writeLibraryFiles(output: string, snapshot: string, files: Array<{ name: string; content: string }>) {
  if (!files.length || files.length > 20) throw new Error('Write between one and twenty text files per call.');
  const allowed = new Set(['', '.md', '.txt', '.html', '.htm', '.json', '.csv', '.js', '.mjs', '.cjs', '.css', '.svg', '.xml', '.yaml', '.yml', '.py', '.ts', '.sql', '.r', '.tex']);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (lstatSync(output).isSymbolicLink()) throw new Error('Output folder contains a symbolic link.');
  let bytes = 0;
  const targets = files.map((file) => {
    if (typeof file.name !== 'string' || !file.name.trim() || typeof file.content !== 'string') throw new Error('Each file needs a relative name and text content.');
    const name = file.name.replaceAll('\\', '/');
    if (isAbsolute(name) || /^[a-z]:/i.test(name) || name.split('/').some((part) => !part || part === '.' || part === '..') || name.includes('\0')) throw new Error('Use relative filenames within this chat’s output folder.');
    if (!allowed.has(extname(name).toLowerCase())) throw new Error('This tool writes text files. Use Python or image tools for binary files.');
    if (extname(name).toLowerCase() === '.json') {
      try { JSON.parse(file.content); }
      catch { throw new Error(`Invalid JSON in ${name}. Encode missing values as null and use finite numbers; NaN and Infinity are not JSON.`); }
    }
    bytes += Buffer.byteLength(file.content);
    if (bytes > 500_000) throw new Error('Text output exceeds 500 KB. Split larger work across calls.');
    const path = resolve(output, name);
    for (let current = path; current !== output; current = dirname(current)) {
      try {
        const info = lstatSync(current);
        if (info.isSymbolicLink()) throw new Error('Output path contains a symbolic link.');
        if (current === path ? info.isDirectory() : !info.isDirectory()) throw new Error('Output path conflicts with an existing file or directory.');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return { ...file, name, path };
  });
  const names = targets.map((file) => file.name);
  if (new Set(names).size !== names.length || names.some((name) => names.some((other) => other.startsWith(`${name}/`)))) throw new Error('Output names must be unique and cannot contain one another.');
  const temporary = join(dirname(snapshot), `write-${randomUUID()}`);
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  try {
    for (const [index, file] of targets.entries()) writeFileSync(join(temporary, String(index)), file.content, { mode: 0o600 });
    for (const [index, file] of targets.entries()) { mkdirSync(dirname(file.path), { recursive: true }); renameSync(join(temporary, String(index)), file.path); }
    let visited = 0, size = 0;
    const copy = (folder: string, depth = 0) => {
      if (depth > 16) throw new Error('Output folders exceed the supported depth.');
      for (const name of readdirSync(folder)) {
        if (++visited > 2000) throw new Error('Working files exceed the 2,000-entry limit.');
        const source = join(folder, name), info = lstatSync(source);
        if (info.isSymbolicLink()) continue;
        if (info.isDirectory()) copy(source, depth + 1);
        else if (info.isFile()) {
          size += info.size;
          if (size > 250 * 1024 * 1024) throw new Error('Working files exceed 250 MB.');
          const destination = join(snapshot, relative(output, source));
          mkdirSync(dirname(destination), { recursive: true }); copyFileSync(source, destination);
        }
      }
    };
    copy(output);
    const published = readOutputPublicationState(output);
    if (published) {
      for (const file of targets) published.set(file.path, createHash('sha256').update(file.content).digest('hex'));
      saveOutputPublicationState(output, published);
    }
    return targets.map((file) => ({ name: file.name, path: join(snapshot, file.name) }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
