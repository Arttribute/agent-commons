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
from sklearn.linear_model import LinearRegression
from PIL import ImageFont
assert set(FONT_FILES) == {'sans', 'sans_bold', 'serif', 'mono'}
assert ImageFont.truetype(FONT_FILES['sans_bold'], 28).getbbox('Jessica Colaço — measured data')[2] > 100
import os
assert os.environ['OUTPUT_DIR'] == str(OUTPUT_DIR)
assert os.environ['WORKSPACE_ROOT'] == WORKSPACE_ROOT
assert INPUT_FILES['sales.csv'] == INPUT_FILES['file-731']
data = pd.read_csv('sales.csv')
out = OUTPUT_DIR / 'reports'
out.mkdir()
(out / 'totals.json').write_text(json.dumps({'sum': int(data.revenue.sum())}))
plt.plot(data.revenue)
plt.savefig(out / 'sales.png')
model = LinearRegression().fit(numpy.array([[1], [2], [3], [4]]), numpy.array([3, 5, 7, 9]))
(out / 'regression-summary.json').write_text(json.dumps({'slope': float(model.coef_[0]), 'intercept': float(model.intercept_), 'prediction': float(model.predict([[5]])[0])}))
try:
    (OUTPUT_DIR / 'external-link').symlink_to(INPUT_FILES['sales.csv'])
except OSError:
    pass
print('Verified managed analysis')`, join(directory, 'run'), { 'sales.csv': join(directory, 'sales.csv'), 'file-731': join(directory, 'sales.csv') }, undefined, 120, ['json', 'os', 'pathlib', 'zipfile', 'numpy', 'pandas', 'PIL', 'sklearn']);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.files.length, 3);
  const regression = JSON.parse(readFileSync(result.files.find((path) => path.endsWith('regression-summary.json')), 'utf8'));
  assert.ok(Math.abs(regression.slope - 2) < 1e-9);
  assert.ok(Math.abs(regression.intercept - 1) < 1e-9);
  assert.ok(Math.abs(regression.prediction - 11) < 1e-9);
  assert.equal(JSON.parse(readFileSync(result.files.find((path) => path.endsWith('totals.json')), 'utf8')).sum, 60);
  assert.equal(readFileSync(result.files.find((path) => path.endsWith('sales.png'))).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const updated = await runtime.run("from pathlib import Path\nPath('sales.csv').write_text('revenue\\n40\\n50\\n')", join(directory, 'overwrite'), { 'sales.csv': join(directory, 'sales.csv') });
  assert.equal(updated.exitCode, 0, updated.stderr);
  assert.equal(updated.files.length, 1, 'Changed staged input was hidden instead of returned as a revised artifact');
  assert.equal(readFileSync(updated.files[0], 'utf8').replaceAll('\r\n', '\n'), 'revenue\n40\n50\n');
  assert.equal(readFileSync(join(directory, 'sales.csv'), 'utf8'), 'revenue\n10\n20\n30\n', 'The source file was modified');
  const workingOutput = join(directory, 'conversation', 'outputs');
  const first = await runtime.run("(OUTPUT_DIR / 'draft.md').write_text('Approved draft v1')\n(OUTPUT_DIR / 'campaign-data.js').write_text('window.price = 49;')", join(directory, 'step-1'), {}, undefined, 120, [], undefined, workingOutput);
  assert.equal(first.exitCode, 0, first.stderr);
  const originalDraft = first.files.find((path) => path.endsWith('draft.md'));
  writeFileSync(join(directory, 'reference-draft.md'), 'Supplied example');
  const second = await runtime.run(`assert (OUTPUT_DIR / 'draft.md').read_text() == 'Approved draft v1'
assert Path(INPUT_FILES['draft.md']).read_text() == 'Supplied example'
(OUTPUT_DIR / 'draft.md').write_text('Approved draft v2')
(OUTPUT_DIR / 'landing.html').write_text('<script src="campaign-data.js"></script>')`, join(directory, 'step-2'), { 'draft.md': join(directory, 'reference-draft.md') }, undefined, 120, [], undefined, workingOutput);
  assert.equal(second.exitCode, 0, second.stderr);
  assert.equal(second.outputDirectory, first.outputDirectory);
  assert.equal(second.files.length, 2, 'Unchanged earlier outputs or reference inputs were re-exported');
  assert.equal(readFileSync(originalDraft, 'utf8'), 'Approved draft v1', 'A prior Library revision changed');
  assert.equal(readFileSync(second.files.find((path) => path.endsWith('draft.md')), 'utf8'), 'Approved draft v2');
  assert.equal(readFileSync(join(second.snapshotDirectory, 'campaign-data.js'), 'utf8'), 'window.price = 49;', 'A relative HTML dependency is missing from its immutable snapshot');
  const third = await runtime.run("assert Path.cwd().samefile(OUTPUT_DIR)\nassert (OUTPUT_DIR / 'draft.md').read_text() == 'Approved draft v2'\nprint('Persistent working files verified')", join(directory, 'step-3'), {}, undefined, 120, [], undefined, workingOutput);
  assert.equal(third.exitCode, 0, third.stderr);
  assert.equal(third.files.length, 0);
  const failed = await runtime.run("(OUTPUT_DIR / 'pending.md').write_text('Recover this draft')\nraise RuntimeError('Later step failed')", join(directory, 'step-failed'), {}, undefined, 120, [], undefined, workingOutput);
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.files.length, 0);
  const invalid = await runtime.run("(OUTPUT_DIR / 'means.json').write_text('{\"mean\":NaN}')", join(directory, 'step-invalid-json'), {}, undefined, 120, [], undefined, workingOutput);
  assert.notEqual(invalid.exitCode, 0);
  assert.match(invalid.stderr, /Invalid JSON/);
  const recovered = await runtime.run("(OUTPUT_DIR / 'means.json').write_text('{\"mean\":60}')", join(directory, 'step-recovered'), {}, undefined, 120, [], undefined, workingOutput);
  assert.equal(recovered.exitCode, 0, recovered.stderr);
  assert.equal(recovered.files.length, 2, 'Files created before a failed step disappeared from later successful publication');
  assert.equal(readFileSync(recovered.files.find((path) => path.endsWith('pending.md')), 'utf8'), 'Recover this draft');
  assert.equal(JSON.parse(readFileSync(recovered.files.find((path) => path.endsWith('means.json')), 'utf8')).mean, 60);
  assert.equal(readFileSync(originalDraft, 'utf8'), 'Approved draft v1');
  const cancelled = new AbortController(); cancelled.abort(new Error('Account switched'));
  await assert.rejects(runtime.run("raise Exception('Must not run after logout')", join(directory, 'cancelled'), {}, undefined, 120, [], cancelled.signal), /Account switched/);
  assert.ok(result.python.startsWith(managed));
  assert.ok(!result.python.includes('extension-'), 'Bundled libraries and stdlib caused an unnecessary environment installation');
  console.log(`Managed Python and data libraries passed on ${process.platform}-${process.arch}; user Python configuration was isolated.`);
} finally {
  for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  rmSync(directory, { recursive: true, force: true });
}
