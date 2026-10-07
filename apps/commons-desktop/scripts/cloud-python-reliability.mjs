import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'tsup';

const app = resolve(import.meta.dirname, '..');
const bundle = join(app, 'node_modules/.cache/cloud-python-reliability');
await build({ entry: { python: join(app, 'src/python-runtime.ts'), cloud: join(app, '../commons-api/src/computer/python-analysis.ts') }, outDir: bundle, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', silent: true });
const require = createRequire(import.meta.url);
const { PythonRuntime } = require(join(bundle, 'python.cjs'));
const { CLOUD_PYTHON_BOOTSTRAP } = require(join(bundle, 'cloud.cjs'));
const directory = mkdtempSync(join(tmpdir(), 'commons-cloud-python-'));
try {
  const managed = process.env.COMMONS_PYTHON_TEST_ROOT || join(directory, 'managed');
  const python = await new PythonRuntime(managed).prepare();
  const cloud = join(directory, 'cloud'); mkdirSync(cloud);
  copyFileSync(join(managed, 'uv-0.12.23/uv'), join(cloud, 'uv-0.12.23')); chmodSync(join(cloud, 'uv-0.12.23'), 0o700);
  symlinkSync(join(managed, 'data-3.12.11-v1'), join(cloud, 'data-3.12.11-v1'));
  writeFileSync(join(directory, 'sales.csv'), 'revenue\n10\n20\n30\n');
  writeFileSync(join(directory, 'inputs.json'), JSON.stringify({ files: [{ itemId: 'file-731', name: 'sales.csv', url: pathToFileURL(join(directory, 'sales.csv')).toString() }], packages: ['json', 'os', 'pathlib', 'numpy', 'pandas', 'PIL', 'sklearn'], timeoutSeconds: 120 }));
  writeFileSync(join(directory, 'analysis.py'), `import json, pandas as pd, matplotlib.pyplot as plt
assert INPUT_FILES['sales.csv'] == INPUT_FILES['file-731']
data = pd.read_csv('sales.csv')
out = OUTPUT_DIR / 'reports'
out.mkdir()
(out / 'totals.json').write_text(json.dumps({'sum': int(data.revenue.sum())}))
plt.plot(data.revenue)
plt.savefig(out / 'sales.png')
(out / 'external-link').symlink_to(INPUT_FILES['sales.csv'])
print('Verified cloud bootstrap')`);
  const bootstrap = CLOUD_PYTHON_BOOTSTRAP.replace("Path('/mnt/shared/.commons-python')", `Path(${JSON.stringify(cloud)})`);
  writeFileSync(join(directory, 'bootstrap.py'), bootstrap);
  await promisify(execFile)(python, ['-I', join(directory, 'bootstrap.py')], { timeout: 300_000, maxBuffer: 2_000_000 });
  const result = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'));
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.files.length, 2, 'Only actual generated files belong in the result manifest');
  const file = (name) => Buffer.from(result.files.find((item) => item.name === name).base64, 'base64');
  assert.equal(JSON.parse(file('reports/totals.json').toString()).sum, 60);
  assert.equal(file('reports/sales.png').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  console.log('Cloud bootstrap executed real Python with staged inputs, nested artifacts and no stdlib installation.');
} finally { rmSync(directory, { recursive: true, force: true }); }
