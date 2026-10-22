import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDecision } from './vercel-ignore-build.mjs';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'vercel-build-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, text = 'changed\n') => {
    mkdirSync(dirname(resolve(root, file)), { recursive: true });
    writeFileSync(resolve(root, file), text);
  };
  git('init', '-q');
  git('config', 'user.name', 'Build policy test');
  git('config', 'user.email', 'test@example.invalid');
  const manifests = {
    'apps/commons-app': { name: 'commons-app', dependencies: { sdk: 'workspace:*', ui: 'workspace:*' } },
    'apps/commons-courses': { name: 'commons-courses', dependencies: { sdk: 'workspace:*' } },
    'apps/commons-docs': { name: 'commons-docs' },
    'apps/commons-api': { name: 'commons-api' },
    'packages/sdk': { name: 'sdk', dependencies: { core: 'workspace:*' } },
    'packages/core': { name: 'core' },
    'packages/ui': { name: 'ui' },
  };
  for (const [path, data] of Object.entries(manifests)) write(`${path}/package.json`, JSON.stringify(data));
  write('package.json', '{"name":"root","private":true}');
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const previous = commit();
  return { root, git, write, commit, previous,
    decision: (project, options = {}) => buildDecision({ root, project, previous, ...options }) };
}

for (const [path, expected] of [
  ['apps/commons-courses/app/page.tsx', [false, true, false]],
  ['apps/commons-app/app/page.tsx', [true, false, false]],
  ['apps/commons-docs/content/api.mdx', [false, false, true]],
  ['apps/commons-api/src/agent.ts', [false, false, false]],
  ['infra/aws/api-platform-services.yml', [false, false, false]],
  ['.github/workflows/ci.yml', [false, false, false]],
  ['docs/architecture.md', [false, false, false]],
  ['packages/ui/src/button.tsx', [true, false, false]],
  ['packages/sdk/src/index.ts', [true, true, false]],
  ['packages/core/src/index.ts', [true, true, false]],
  ['pnpm-lock.yaml', [true, true, true]],
  ['patches/dependency.patch', [true, true, true]],
  ['scripts/vercel-ignore-build.mjs', [true, true, true]],
]) {
  test(`correct consumers build for ${path}`, (t) => {
    const f = fixture(t); f.write(path); f.commit();
    assert.deepEqual(['commons-app', 'commons-courses', 'commons-docs'].map((p) => f.decision(`apps/${p}`).build), expected);
  });
}

test('a staging sync with an identical tree skips every app', (t) => {
  const f = fixture(t); f.git('commit', '--allow-empty', '-qm', 'sync staging');
  for (const name of ['commons-app', 'commons-courses', 'commons-docs']) assert.equal(f.decision(`apps/${name}`).build, false);
});

test('a multi-commit release retains earlier relevant changes', (t) => {
  const f = fixture(t); f.write('apps/commons-courses/app/page.tsx'); f.commit();
  f.write('infra/aws/template.yml'); f.commit();
  assert.equal(f.decision('apps/commons-courses').build, true);
});

test('renaming an input out of an app still rebuilds that app', (t) => {
  const f = fixture(t); f.write('apps/commons-app/public/file.txt'); const previous = f.commit();
  f.git('mv', 'apps/commons-app/public/file.txt', 'apps/commons-docs/file.txt'); f.commit();
  assert.equal(f.decision('apps/commons-app', { previous }).build, true);
});

test('first deployments, missing history and explicit overrides build safely', (t) => {
  const f = fixture(t);
  for (const options of [{ previous: undefined }, { previous: 'a'.repeat(40) }, { current: 'invalid' }, { force: true }]) {
    assert.equal(f.decision('apps/commons-app', options).build, true);
  }
  assert.equal(f.decision('apps/missing').build, true);
});

test('missing workspace dependencies do not silently skip a broken build', (t) => {
  const f = fixture(t);
  f.write('apps/commons-app/package.json', JSON.stringify({ name: 'commons-app', dependencies: { missing: 'workspace:*' } }));
  const previous = f.commit(); f.write('docs/readme.md'); f.commit();
  assert.equal(f.decision('apps/commons-app', { previous }).build, true);
});

test('the CLI uses Vercel exit codes from the app working directory', (t) => {
  const f = fixture(t); f.write('apps/commons-courses/page.tsx'); f.commit();
  const script = fileURLToPath(new URL('./vercel-ignore-build.mjs', import.meta.url));
  for (const [project, status] of [['commons-app', 0], ['commons-courses', 1]]) {
    const result = spawnSync(process.execPath, [script, `apps/${project}`], {
      cwd: resolve(f.root, `apps/${project}`),
      env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: f.previous, VERCEL_GIT_COMMIT_SHA: f.git('rev-parse', 'HEAD'), VERCEL_FORCE_BUILD: '0' },
      encoding: 'utf8',
    });
    assert.equal(result.status, status, result.stdout + result.stderr);
  }
});
