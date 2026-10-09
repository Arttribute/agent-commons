import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'tsup';

// Linux CI reproduces the musl agent computer from an empty runtime cache.
const app = resolve(import.meta.dirname, '..');
const bundle = join(app, 'node_modules/.cache/cloud-python-alpine');
await build({ entry: { cloud: join(app, '../commons-api/src/computer/python-analysis.ts') }, outDir: bundle, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', silent: true });
const { CLOUD_PYTHON_BOOTSTRAP } = createRequire(import.meta.url)(join(bundle, 'cloud.cjs'));
const directory = mkdtempSync(join(tmpdir(), 'commons-alpine-python-'));
try {
  writeFileSync(join(directory, 'bootstrap.py'), CLOUD_PYTHON_BOOTSTRAP);
  writeFileSync(join(directory, 'verify.py'), String.raw`import base64, hashlib, json, subprocess, sys
from pathlib import Path
system = Path(sys.executable).resolve()
before = hashlib.sha256(system.read_bytes()).hexdigest()
def step(name, code):
    run = Path('/tmp') / name
    run.mkdir()
    (run / 'bootstrap.py').write_text(Path('/acceptance/bootstrap.py').read_text())
    (run / 'analysis.py').write_text(code)
    (run / 'inputs.json').write_text(json.dumps({'files': [], 'packages': [], 'timeoutSeconds': 120, 'workingDirectory': 'sessions/acceptance/outputs'}))
    subprocess.run([sys.executable, str(run / 'bootstrap.py')], check=True, timeout=540)
    return json.loads((run / 'result.json').read_text())
first = step('platform-first', '''import json, numpy as np, pandas, matplotlib.pyplot as plt, scipy, sklearn, seaborn, openpyxl, PIL
from sklearn.linear_model import LinearRegression
model = LinearRegression().fit(np.array([1, 2, 3, 4]).reshape(-1, 1), [3, 5, 7, 9])
(OUTPUT_DIR / 'regression.json').write_text(json.dumps({'slope': float(model.coef_[0]), 'intercept': float(model.intercept_), 'prediction': float(model.predict([[5]])[0])}, allow_nan=False))
plt.plot([1, 2, 3, 4], [3, 5, 7, 9]); plt.savefig(OUTPUT_DIR / 'regression.png')''')
assert first['exitCode'] == 0, first
files = {f['name']: base64.b64decode(f['base64']) for f in first['files']}
regression = json.loads(files['regression.json'])
assert abs(regression['slope'] - 2) < 1e-8 and abs(regression['intercept'] - 1) < 1e-8 and abs(regression['prediction'] - 11) < 1e-8
assert files['regression.png'][:8] == b'\x89PNG\r\n\x1a\n'
second = step('platform-second', "assert (OUTPUT_DIR / 'regression.png').exists()\n(OUTPUT_DIR / 'next.md').write_text('Warm runtime working files retained')")
assert second['exitCode'] == 0 and [f['name'] for f in second['files']] == ['next.md'], second
assert hashlib.sha256(system.read_bytes()).hexdigest() == before
assert subprocess.check_output(['/bin/sh', '-c', 'printf system-shell-unchanged']).decode() == 'system-shell-unchanged'
Path('/acceptance/verified.json').write_text(json.dumps({'regression': regression, 'coldFiles': sorted(files), 'warmFiles': [f['name'] for f in second['files']], 'systemPythonUnchanged': True}))
`);
  const { stdout, stderr } = await promisify(execFile)('docker', ['run', '--rm', '--memory=2g', '--cpus=1', '-v', `${directory}:/acceptance`, 'public.ecr.aws/docker/library/alpine:3.24.2', '/bin/sh', '-ec', 'apk add --no-cache python3 ca-certificates; python3 /acceptance/verify.py'], { timeout: 660_000, maxBuffer: 4_000_000 });
  const result = JSON.parse(readFileSync(join(directory, 'verified.json'), 'utf8'));
  assert.equal(result.systemPythonUnchanged, true);
  console.log(stdout, stderr, result);
} finally { rmSync(directory, { recursive: true, force: true }); }
