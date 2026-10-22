import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sharedFiles = new Set([
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc',
  '.pnpmfile.cjs', '.nvmrc', '.node-version', '.gitignore', '.vercelignore',
  'vercel.json', 'scripts/vercel-ignore-build.mjs',
]);

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, timeout: 15_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Exit 0 means skip in Vercel's Ignored Build Step; exit 1 means build.
// Compare with this project's last successful deployment on this branch, not
// HEAD^: a release can contain many commits, and staging syncs have no changes.
export function buildDecision({ root, project, previous, current = 'HEAD', force = false }) {
  if (force) return { build: true, reason: 'Explicit build override' };
  if (!previous) return { build: true, reason: 'First deployment on this branch' };
  try {
    // Vercel shallow-clones only recent commits. A rarely changed app may have
    // last deployed much earlier: fetch that exact commit, never replace it
    // with HEAD^. If fetching is unavailable, the catch below builds safely.
    try { git(root, 'cat-file', '-e', `${previous}^{commit}`); }
    catch (error) {
      if (!/^[a-f0-9]{40}$/i.test(previous)) throw error;
      git(root, 'fetch', '--no-tags', '--depth=1', 'origin', previous);
      git(root, 'cat-file', '-e', `${previous}^{commit}`);
    }
    git(root, 'cat-file', '-e', `${current}^{commit}`);
    const packages = new Map();
    for (const group of ['apps', 'packages']) {
      for (const entry of readdirSync(resolve(root, group), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const directory = `${group}/${entry.name}`;
        let manifest;
        try { manifest = readFileSync(resolve(root, directory, 'package.json'), 'utf8'); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        const data = JSON.parse(manifest);
        if (!data.name) throw new Error(`Workspace has no name: ${directory}`);
        if (packages.has(data.name)) throw new Error(`Duplicate workspace name: ${data.name}`);
        packages.set(data.name, { directory, data });
      }
    }
    const app = [...packages.values()].find((p) => p.directory === project);
    if (!app) throw new Error(`Unknown project: ${project}`);
    const directories = new Set();
    const visit = (pkg) => {
      if (directories.has(pkg.directory)) return;
      directories.add(pkg.directory);
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, version] of Object.entries(pkg.data[section] ?? {})) {
          if (packages.has(name)) visit(packages.get(name));
          else if (version.startsWith('workspace:')) throw new Error(`Missing workspace: ${name}`);
        }
      }
    };
    visit(app);
    const files = git(root, 'diff', '--name-only', '--no-renames', '-z', previous, current, '--').split('\0').filter(Boolean);
    const relevant = files.find((file) => sharedFiles.has(file) || file.startsWith('patches/') ||
      [...directories].some((directory) => file.startsWith(`${directory}/`)));
    return relevant
      ? { build: true, reason: `Changed build input: ${relevant}` }
      : { build: false, reason: `No changes to ${project} or its workspace dependencies` };
  } catch (error) {
    return { build: true, reason: `Cannot prove this build is unnecessary: ${error.message.split('\n')[0]}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
    const decision = buildDecision({ root, project: process.argv[2],
      previous: process.env.VERCEL_GIT_PREVIOUS_SHA,
      current: process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD',
      force: process.env.VERCEL_FORCE_BUILD === '1' });
    console.log(`${decision.build ? 'BUILD' : 'SKIP'}: ${decision.reason}`);
    process.exitCode = decision.build ? 1 : 0;
  } catch (error) {
    console.log(`BUILD: ${error.message}`);
    process.exitCode = 1;
  }
}
