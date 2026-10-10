import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'tsup';

// Linux CI reproduces a cold musl computer, then a replacement pod with only
// its private volume retained and networking disabled.
const app = resolve(import.meta.dirname, '..');
const bundle = join(app, 'node_modules/.cache/cloud-python-alpine');
await build({ entry: { cloud: join(app, '../commons-api/src/computer/python-analysis.ts') }, outDir: bundle, format: ['cjs'], outExtension: () => ({ js: '.cjs' }), platform: 'node', target: 'node22', silent: true });
const { CLOUD_PYTHON_BOOTSTRAP } = createRequire(import.meta.url)(join(bundle, 'cloud.cjs'));
const directory = mkdtempSync(join(tmpdir(), 'commons-alpine-python-'));
try {
  const shared = join(directory, 'shared');
  mkdirSync(shared);
  writeFileSync(join(directory, 'bootstrap.py'), CLOUD_PYTHON_BOOTSTRAP);
  writeFileSync(join(directory, 'verify.py'), String.raw`import base64, hashlib, json, subprocess, sys
from pathlib import Path
system = Path(sys.executable).resolve()
before = hashlib.sha256(system.read_bytes()).hexdigest()
legacy = Path('/mnt/shared/.commons-python/runtime/old-environment')
legacy.mkdir(parents=True)
(legacy / 'retained-marker').write_text('Preserve old cache without importing relocated binaries')
def step(name, code, acknowledge=True):
    run = Path('/tmp') / name
    run.mkdir()
    (run / 'bootstrap.py').write_text(Path('/acceptance/bootstrap.py').read_text())
    (run / 'analysis.py').write_text(code)
    (run / 'inputs.json').write_text(json.dumps({'files': [], 'packages': [], 'timeoutSeconds': 120, 'workingDirectory': 'sessions/acceptance/outputs'}))
    subprocess.run([sys.executable, str(run / 'bootstrap.py')], check=True, timeout=540)
    result = json.loads((run / 'result.json').read_text())
    if acknowledge and result['exitCode'] == 0:
        receipts = Path(result['outputDirectory'] + '.acks')
        receipts.mkdir(exist_ok=True)
        (receipts / (name + '.json')).write_text(json.dumps({file['name']: hashlib.sha256((Path(result['outputDirectory']) / file['name']).read_bytes()).hexdigest() for file in result['files']}))
    return result
first = step('platform-first', '''import json, numpy as np, pandas, matplotlib.pyplot as plt, scipy, sklearn, seaborn, openpyxl, PIL
from sklearn.linear_model import LinearRegression
model = LinearRegression().fit(np.array([1, 2, 3, 4]).reshape(-1, 1), [3, 5, 7, 9])
(OUTPUT_DIR / 'regression.json').write_text(json.dumps({'slope': float(model.coef_[0]), 'intercept': float(model.intercept_), 'prediction': float(model.predict([[5]])[0])}, allow_nan=False))
plt.plot([1, 2, 3, 4], [3, 5, 7, 9]); plt.savefig(OUTPUT_DIR / 'regression.png')
print('large output ' * 20000)
print('analysis completed')''', acknowledge=False)
assert first['exitCode'] == 0, first
assert first['stdout'].endswith('analysis completed' + chr(10)) and len(first['stdout']) <= 32000
assert not legacy.exists(), 'Legacy runtime remains in the watched workspace'
retained = list(Path('/mnt/shared/.commons-python/.cache').glob('legacy-runtime-*/old-environment/retained-marker'))
assert len(retained) == 1 and retained[0].read_text() == 'Preserve old cache without importing relocated binaries'
files = {f['name']: base64.b64decode(f['base64']) for f in first['files']}
regression = json.loads(files['regression.json'])
assert abs(regression['slope'] - 2) < 1e-8 and abs(regression['intercept'] - 1) < 1e-8 and abs(regression['prediction'] - 11) < 1e-8
assert files['regression.png'][:8] == b'\x89PNG\r\n\x1a\n'
original_manifest = Path('/tmp/platform-first/result.json').read_bytes()
original_script = Path('/tmp/platform-first/analysis.py').read_bytes()
# Reproduce a killed installer: an unfinished environment with an installed
# package directory but missing metadata. Existing uv scans fail on this state.
environments = list(Path('/mnt/shared/.commons-python/.cache/runtime').glob('*/data-*/commons-ready'))
assert len(environments) == 1
environment = environments[0].parent
metadata = environment / 'lib/python3.12/site-packages/seaborn-0.13.2.dist-info/METADATA'
assert metadata.is_file()
environments[0].unlink()
metadata.unlink()
subprocess.run([sys.executable, '/tmp/platform-first/bootstrap.py'], check=True, timeout=30)
assert Path('/tmp/platform-first/result.json').read_bytes() == original_manifest, 'Terminal retry replaced the original output manifest'
assert Path('/tmp/platform-first/analysis.py').read_bytes() == original_script, 'Terminal retry ran or rewrote the source code again'
recovered = step('platform-recover-publication', "print('Recover outputs whose Library upload was interrupted')")
assert recovered['exitCode'] == 0 and {file['name'] for file in recovered['files']} == set(files), recovered
assert (environment / 'commons-ready').is_file() and metadata.is_file(), 'Interrupted environment was not rebuilt'
assert all(base64.b64decode(file['base64']) == files[file['name']] for file in recovered['files'])
second = step('platform-second', "assert (OUTPUT_DIR / 'regression.png').exists()\n(OUTPUT_DIR / 'next.md').write_text('Warm runtime working files retained')")
assert second['exitCode'] == 0 and [f['name'] for f in second['files']] == ['next.md'], second
assert hashlib.sha256(system.read_bytes()).hexdigest() == before
assert subprocess.check_output(['/bin/sh', '-c', 'printf system-shell-unchanged']).decode() == 'system-shell-unchanged'
Path('/acceptance/verified.json').write_text(json.dumps({'regression': regression, 'coldFiles': sorted(files), 'warmFiles': [f['name'] for f in second['files']], 'systemPythonUnchanged': True, 'terminalRetryPreservedManifest': True, 'unacknowledgedOutputsRecovered': True}))
`);
  writeFileSync(join(directory, 'verify-replacement.py'), String.raw`import base64, json, subprocess, sys
from pathlib import Path
assert not Path('/tmp/commons-python-runtime').exists()
run = Path('/tmp/replacement-run')
run.mkdir()
(run / 'bootstrap.py').write_text(Path('/acceptance/bootstrap.py').read_text())
(run / 'inputs.json').write_text(json.dumps({'files': [], 'packages': ['numpy', 'PIL', 'sklearn'], 'timeoutSeconds': 120, 'workingDirectory': 'sessions/acceptance/outputs'}))
(run / 'analysis.py').write_text('''import json, numpy as np
from sklearn.linear_model import LinearRegression
from PIL import Image
assert json.loads((OUTPUT_DIR / 'regression.json').read_text())['prediction'] == 11
with Image.open(OUTPUT_DIR / 'regression.png') as image: image.verify()
assert (OUTPUT_DIR / 'next.md').read_text() == 'Warm runtime working files retained'
assert all(Path(font).is_file() for font in FONT_FILES.values())
model = LinearRegression().fit(np.array([1, 2, 3, 4]).reshape(-1, 1), [3, 5, 7, 9])
(OUTPUT_DIR / 'replacement.json').write_text(json.dumps({'prediction': float(model.predict([[5]])[0])}, allow_nan=False))
''')
subprocess.run([sys.executable, str(run / 'bootstrap.py')], check=True, timeout=90)
result = json.loads((run / 'result.json').read_text())
assert result['exitCode'] == 0 and [file['name'] for file in result['files']] == ['replacement.json'], result
assert json.loads(base64.b64decode(result['files'][0]['base64']))['prediction'] == 11
assert not list(Path('/mnt/shared/.commons-python/.cache/runtime').glob('*/extension-*')), 'Installed alias imports must reuse the base environment'
Path('/acceptance/replacement-verified.json').write_text(json.dumps({'replacementPod': True, 'networkDisabled': True, 'retainedSources': True, 'actualRegression': True, 'fontsAvailable': True, 'publishedOnlyNewOutput': True}))
`);
  const image = 'public.ecr.aws/docker/library/alpine:3.24.2';
  const mounts = ['-v', `${directory}:/acceptance`, '-v', `${shared}:/mnt/shared`];
  // Match the host owner for the mounted private volume; otherwise root-owned
  // container cache files can mask a failed check with a cleanup EACCES.
  const owner = `${process.getuid()}:${process.getgid()}`;
  const { stdout, stderr } = await promisify(execFile)('docker', ['run', '--rm', '--memory=2g', '--cpus=1', ...mounts, image, '/bin/sh', '-ec', `apk add --no-cache python3 ca-certificates su-exec; su-exec ${owner} python3 /acceptance/verify.py`], { timeout: 660_000, maxBuffer: 4_000_000 });
  const result = JSON.parse(readFileSync(join(directory, 'verified.json'), 'utf8'));
  assert.equal(result.systemPythonUnchanged, true);
  // There is no system Python or package installation in this fresh container.
  // The cached interpreter and ELF loader must work at their persisted paths.
  await promisify(execFile)('docker', ['run', '--rm', '--user', owner, '--network=none', '--memory=2g', '--cpus=1', ...mounts, image, '/bin/sh', '-ec', 'managed=$(find /mnt/shared/.commons-python/.cache/runtime -path "*/data-*/bin/python" -print -quit); test -n "$managed"; "$managed" -I /acceptance/verify-replacement.py'], { timeout: 120_000, maxBuffer: 4_000_000 });
  const replacement = JSON.parse(readFileSync(join(directory, 'replacement-verified.json'), 'utf8'));
  assert.equal(replacement.networkDisabled, true);
  console.log(stdout, stderr, result, replacement);
} finally { rmSync(directory, { recursive: true, force: true }); }
