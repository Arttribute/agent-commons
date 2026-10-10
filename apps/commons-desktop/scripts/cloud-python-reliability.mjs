import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'tsup';

const app = resolve(import.meta.dirname, '..');
const bundle = join(app, 'node_modules/.cache/cloud-python-reliability');
await build({ entry: { python: join(app, 'src/python-runtime.ts'), cloud: join(app, '../commons-api/src/computer/python-analysis.ts') }, outDir: bundle, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', silent: true });
const require = createRequire(import.meta.url);
const { PYTHON_DATA_PACKAGES } = require('@agent-commons/agent-core');
  const { PythonRuntime } = require(join(bundle, 'python.cjs'));
const { CLOUD_PYTHON_BOOTSTRAP } = require(join(bundle, 'cloud.cjs'));
const directory = mkdtempSync(join(tmpdir(), 'commons-cloud-python-'));
function acknowledge(run, result) {
  if (result.exitCode !== 0 || !result.files.length) return;
  const hashes = Object.fromEntries(result.files.map(file => {
    const bytes = file.chunks ? Buffer.concat(file.chunks.map(part => Buffer.from(readFileSync(join(run, part), 'utf8'), 'base64'))) : Buffer.from(file.base64, 'base64');
    return [file.name, createHash('sha256').update(bytes).digest('hex')];
  }));
  const receipts = result.outputDirectory + '.acks';
  mkdirSync(receipts, { recursive: true });
  writeFileSync(join(receipts, basename(run) + '.json'), JSON.stringify(hashes));
}
try {
  const managed = process.env.COMMONS_PYTHON_TEST_ROOT || join(directory, 'managed');
  const python = await new PythonRuntime(managed).prepare();
  const cloud = join(directory, 'cloud'); mkdirSync(cloud);
  copyFileSync(join(managed, 'uv-0.12.23/uv'), join(cloud, 'uv-0.12.23')); chmodSync(join(cloud, 'uv-0.12.23'), 0o700);
  // Match Python json.dumps' default separator spacing for the pinned cache key.
  const baseKey = createHash('sha256').update(JSON.stringify(['3.12.11', [...PYTHON_DATA_PACKAGES].sort()]).replaceAll(',', ', ')).digest('hex').slice(0, 16);
  symlinkSync(join(managed, 'data-3.12.11-v1'), join(cloud, `data-3.12.11-${baseKey}`));
  writeFileSync(join(directory, 'sales.csv'), 'revenue\n10\n20\n30\n');
  writeFileSync(join(directory, 'inputs.json'), JSON.stringify({ files: [{ itemId: 'file-731', name: 'sales.csv', url: pathToFileURL(join(directory, 'sales.csv')).toString() }], packages: ['json', 'os', 'pathlib', 'numpy', 'pandas', 'PIL', 'sklearn'], timeoutSeconds: 120, workingDirectory: 'sessions/acceptance/outputs' }));
  writeFileSync(join(directory, 'analysis.py'), `import json, os, pandas as pd, matplotlib.pyplot as plt
from PIL import ImageFont
assert set(FONT_FILES) == {'sans', 'sans_bold', 'serif', 'mono'}
assert ImageFont.truetype(FONT_FILES['sans_bold'], 28).getbbox('Jessica Colaço — measured data')[2] > 100
assert os.environ["OUTPUT_DIR"] == str(OUTPUT_DIR)
assert os.environ["WORKSPACE_ROOT"] == WORKSPACE_ROOT
assert INPUT_FILES['sales.csv'] == INPUT_FILES['file-731']
data = pd.read_csv('sales.csv')
out = OUTPUT_DIR / 'reports'
out.mkdir()
(out / 'totals.json').write_text(json.dumps({'sum': int(data.revenue.sum())}))
plt.plot(data.revenue)
plt.savefig(out / 'sales.png')
(out / 'external-link').symlink_to(INPUT_FILES['sales.csv'])
Path(INPUT_FILES['sales.csv']).write_text('revenue\\n40\\n50\\n')
(OUTPUT_DIR / 'large-report.bin').write_bytes(b'a' * 650000)
print('Verified cloud bootstrap')`);
  // Reuse this host's verified uv executable while exercising the cloud code.
  const bootstrap = CLOUD_PYTHON_BOOTSTRAP.replace("Path('/mnt/shared/.commons-python')", `Path(${JSON.stringify(cloud)})`).replace("resources = root / '.cache' / 'runtime' / triple", `resources = Path(${JSON.stringify(cloud)})`).replace("uv = resources / ('uv-0.12.23-' + triple)", "uv = resources / 'uv-0.12.23'");
  writeFileSync(join(directory, 'bootstrap.py'), bootstrap);
  await promisify(execFile)(python, ['-I', join(directory, 'bootstrap.py')], { timeout: 300_000, maxBuffer: 2_000_000 });
  const result = JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8'));
  acknowledge(directory, result);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.files.length, 4, 'Only actual generated files belong in the result manifest');
  const file = (name) => {
    const item = result.files.find((entry) => entry.name === name);
    return item.chunks ? Buffer.concat(item.chunks.map((part) => Buffer.from(readFileSync(join(directory, part), 'utf8'), 'base64'))) : Buffer.from(item.base64, 'base64');
  };
  assert.equal(file('large-report.bin').length, 650000);
  assert.ok(readFileSync(join(directory, 'result.json')).length < 500000, 'Result manifest exceeds the CommonOS preview limit');
  assert.equal(JSON.parse(file('reports/totals.json').toString()).sum, 60);
  assert.equal(file('sales.csv').toString(), 'revenue\n40\n50\n');
  assert.equal(readFileSync(join(directory, 'sales.csv'), 'utf8'), 'revenue\n10\n20\n30\n', 'The source input was changed');
  assert.equal(file('reports/sales.png').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const nextRun = join(directory, 'next-run'); mkdirSync(nextRun);
  copyFileSync(join(directory, 'inputs.json'), join(nextRun, 'inputs.json'));
  writeFileSync(join(nextRun, 'analysis.py'), `import json
assert (OUTPUT_DIR / 'reports' / 'totals.json').exists()
assert Path(INPUT_FILES['sales.csv']).read_text() == 'revenue\\n10\\n20\\n30\\n'
(OUTPUT_DIR / 'reports' / 'totals.json').write_text(json.dumps({'sum': 90}))
print('Cloud working files persisted')`);
  writeFileSync(join(nextRun, 'bootstrap.py'), bootstrap);
  await promisify(execFile)(python, ['-I', join(nextRun, 'bootstrap.py')], { timeout: 300_000, maxBuffer: 2_000_000 });
  const next = JSON.parse(readFileSync(join(nextRun, 'result.json'), 'utf8'));
  acknowledge(nextRun, next);
  assert.equal(next.exitCode, 0, next.stderr);
  assert.equal(next.outputDirectory, result.outputDirectory);
  assert.equal(next.files.length, 1, 'Unchanged files were exported again');
  assert.equal(JSON.parse(Buffer.from(next.files[0].base64, 'base64').toString()).sum, 90);
  assert.equal(JSON.parse(file('reports/totals.json').toString()).sum, 60, 'The previous cloud artifact changed');
  const step = async (name, code) => {
    const folder = join(directory, name); mkdirSync(folder);
    copyFileSync(join(directory, 'inputs.json'), join(folder, 'inputs.json'));
    writeFileSync(join(folder, 'analysis.py'), code);
    writeFileSync(join(folder, 'bootstrap.py'), bootstrap);
    await promisify(execFile)(python, ['-I', join(folder, 'bootstrap.py')], { timeout: 300_000, maxBuffer: 2_000_000 });
    const result = JSON.parse(readFileSync(join(folder, 'result.json'), 'utf8'));
    acknowledge(folder, result);
    return result;
  };
  const failed = await step('failed-step', "(OUTPUT_DIR / 'pending.md').write_text('Preserved draft')\nraise RuntimeError('Render failed')");
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.files.length, 0);
  const invalid = await step('invalid-json', "(OUTPUT_DIR / 'means.json').write_text('{\"mean\":NaN}')");
  assert.notEqual(invalid.exitCode, 0);
  assert.match(invalid.stderr, /Invalid JSON/);
  const recovered = await step('recovered-step', "(OUTPUT_DIR / 'means.json').write_text('{\"mean\":60}')");
  assert.equal(recovered.exitCode, 0, recovered.stderr);
  assert.equal(recovered.files.length, 2, 'Failed-run files were lost from the successful result');
  assert.equal(Buffer.from(recovered.files.find((item) => item.name === 'pending.md').base64, 'base64').toString(), 'Preserved draft');
  const missingInput = join(directory, 'missing-input-run'); mkdirSync(missingInput);
  writeFileSync(join(missingInput, 'bootstrap.py'), bootstrap);
  writeFileSync(join(missingInput, 'analysis.py'), "raise AssertionError('Analysis must not run without its source')");
  writeFileSync(join(missingInput, 'inputs.json'), JSON.stringify({ files: [{ itemId: 'missing', name: 'missing.csv', url: pathToFileURL(join(directory, 'does-not-exist.csv')).toString() }], packages: [], workingDirectory: 'sessions/acceptance/outputs' }));
  await promisify(execFile)(python, ['-I', join(missingInput, 'bootstrap.py')], { timeout: 300_000, maxBuffer: 2_000_000 });
  const missing = JSON.parse(readFileSync(join(missingInput, 'result.json'), 'utf8'));
  assert.equal(missing.exitCode, -1);
  assert.match(missing.stderr, /Python bootstrap failed.*URLError/);
  assert.deepEqual(missing.files, [], 'Preparation failure claimed generated outputs');
  console.log('Cloud bootstrap executed real Python with staged inputs, nested artifacts and no stdlib installation.');
} finally { rmSync(directory, { recursive: true, force: true }); }
