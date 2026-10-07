import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'tsup';

const app = resolve(import.meta.dirname, '..');
const output = join(app, 'node_modules/.cache/python-reliability');
await build({ entry: { python: join(app, 'src/python-runtime.ts') }, outDir: output, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', silent: true });
const { PythonRuntime } = createRequire(import.meta.url)(join(output, 'python.cjs'));
const directory = mkdtempSync(join(tmpdir(), 'commons-python-acceptance-'));
const variables = ['PYTHONPATH', 'PYTHONHOME', 'UV_PYTHON_INSTALL_DIR', 'UV_PYTHON_PREFERENCE', 'PIP_TARGET'];
const saved = new Map(variables.map((name) => [name, process.env[name]]));
try {
  for (const name of variables) process.env[name] = '/unusable-user-python-configuration';
  const managed = process.env.COMMONS_PYTHON_TEST_ROOT || join(directory, 'managed');
  const runtime = new PythonRuntime(managed);
  writeFileSync(join(directory, 'sales.csv'), 'revenue\n10\n20\n30\n');
  const result = await runtime.run(`import json, pandas as pd, matplotlib.pyplot as plt, numpy, scipy, sklearn, seaborn, openpyxl, PIL
assert INPUT_FILES['sales.csv'] == INPUT_FILES['file-731']
data = pd.read_csv('sales.csv')
out = OUTPUT_DIR / 'reports'
out.mkdir()
(out / 'totals.json').write_text(json.dumps({'sum': int(data.revenue.sum())}))
plt.plot(data.revenue)
plt.savefig(out / 'sales.png')
try:
    (OUTPUT_DIR / 'external-link').symlink_to(INPUT_FILES['sales.csv'])
except OSError:
    pass
print('Verified managed analysis')`, join(directory, 'run'), { 'sales.csv': join(directory, 'sales.csv'), 'file-731': join(directory, 'sales.csv') }, undefined, 120, ['json', 'os', 'pathlib', 'zipfile', 'numpy', 'pandas', 'PIL', 'sklearn']);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.files.length, 2);
  assert.equal(JSON.parse(readFileSync(result.files.find((path) => path.endsWith('totals.json')), 'utf8')).sum, 60);
  assert.equal(readFileSync(result.files.find((path) => path.endsWith('sales.png'))).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const updated = await runtime.run("from pathlib import Path\nPath('sales.csv').write_text('revenue\\n40\\n50\\n')", join(directory, 'overwrite'), { 'sales.csv': join(directory, 'sales.csv') });
  assert.equal(updated.exitCode, 0, updated.stderr);
  assert.equal(updated.files.length, 1, 'Changed staged input was hidden instead of returned as a revised artifact');
  assert.equal(readFileSync(updated.files[0], 'utf8'), 'revenue\n40\n50\n');
  assert.equal(readFileSync(join(directory, 'sales.csv'), 'utf8'), 'revenue\n10\n20\n30\n', 'The source file was modified');
  assert.ok(result.python.startsWith(managed));
  assert.ok(!result.python.includes('extension-'), 'Bundled libraries and stdlib caused an unnecessary environment installation');
  console.log(`Managed Python and data libraries passed on ${process.platform}-${process.arch}; user Python configuration was isolated.`);
} finally {
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  rmSync(directory, { recursive: true, force: true });
}
