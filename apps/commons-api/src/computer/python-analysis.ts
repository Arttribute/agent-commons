import { createHash, randomUUID } from 'node:crypto';
import { PYTHON_DATA_PACKAGES, PYTHON_PACKAGE_SELECTION_CODE } from '@agent-commons/agent-core';

// Bootstrap runs in the agent's isolated CommonOS computer, never in the API
// process. A managed interpreter is installed without modifying system Python.
export const CLOUD_PYTHON_BOOTSTRAP = String.raw`import base64, fcntl, hashlib, json, mimetypes, os, platform, subprocess, sys, tarfile, urllib.request
from pathlib import Path
run = Path(__file__).resolve().parent
config = json.loads((run / 'inputs.json').read_text())
root = Path('/mnt/shared/.commons-python')
root.mkdir(parents=True, exist_ok=True)
uv = root / 'uv-0.12.23'
triple, digest = ('aarch64-unknown-linux-gnu', '6524bd338177ed50d035d39354e12545e993bbeba2ecbddf0480c5b3a81d313f') if platform.machine() in ('aarch64', 'arm64') else ('x86_64-unknown-linux-gnu', '9167d72b3319674b6303c4cbe071854bba13ebdf3d76b1a7cbdc175471fb66d6')
env = {k: v for k, v in os.environ.items() if not k.startswith(('UV_', 'PYTHON', 'PIP_', 'CONDA')) and k != 'VIRTUAL_ENV'}
env.update(UV_PYTHON_INSTALL_DIR=str(root / 'interpreters'), UV_PYTHON_BIN_DIR=str(root / 'bin'), UV_CACHE_DIR=str(root / 'cache'), UV_NO_CONFIG='1', UV_PYTHON_PREFERENCE='only-managed', PYTHONNOUSERSITE='1', MPLBACKEND='Agg', MPLCONFIGDIR=str(root / 'matplotlib'))
packages = config.get('packages', [])
base_packages = ${JSON.stringify(PYTHON_DATA_PACKAGES)}
with (root / '.prepare.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if not uv.exists():
        with urllib.request.urlopen('https://github.com/astral-sh/uv/releases/download/0.12.23/uv-' + triple + '.tar.gz', timeout=120) as response:
            archive = response.read(60 * 1024 * 1024)
        if hashlib.sha256(archive).hexdigest() != digest: raise RuntimeError('Python runtime integrity check failed')
        import io
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith('/uv') and m.isfile())
            uv.write_bytes(tar.extractfile(member).read())
        uv.chmod(0o700)
    def prepare(venv, requirements):
        python = venv / 'bin/python'
        if not (venv / 'commons-ready').exists():
            if not python.exists(): subprocess.run([str(uv), 'venv', '--python', '3.12.11', '--no-config', str(venv)], env=env, check=True, timeout=300)
            subprocess.run([str(uv), 'pip', 'install', '--python', str(python), '--no-config'] + requirements, env=env, check=True, timeout=300)
            subprocess.run([str(python), '-I', '-c', 'import numpy, pandas, matplotlib, scipy, sklearn, seaborn, openpyxl, PIL'], env=env, check=True)
            (venv / 'commons-ready').write_text('ready')
        return python
    python = prepare(root / 'data-3.12.11-v1', base_packages)
    if packages:
        selection = subprocess.run([str(python), '-I', '-c', ${JSON.stringify(PYTHON_PACKAGE_SELECTION_CODE)}, json.dumps(packages)], env=env, check=True, capture_output=True, text=True, timeout=30)
        packages = json.loads(selection.stdout)
    if packages:
        import re
        overridden = {re.split(r'[<>=~\[]', name)[0].lower().replace('_', '-') for name in packages}
        requirements = [name for name in base_packages if name.split('==')[0] not in overridden] + packages
        python = prepare(root / ('extension-' + hashlib.sha256(json.dumps(sorted(packages)).encode()).hexdigest()[:16]), requirements)
inputs = {}
output = root / config['workingDirectory'] if config.get('workingDirectory') else run / 'outputs'
output.mkdir(parents=True, exist_ok=True)
input_paths = set()
input_hashes = {}
for item in config['files']:
    target = output / Path(item['name']).name
    if target in input_paths: target = output / (item['itemId'] + '-' + Path(item['name']).name)
    with urllib.request.urlopen(item['url'], timeout=60) as response:
        data = response.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024: raise RuntimeError('Input file exceeds 25 MB')
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(data).hexdigest():
        target = run / 'revised-inputs' / item['itemId'] / Path(item['name']).name
        target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists(): target.write_bytes(data)
    input_paths.add(target)
    input_hashes[target] = hashlib.sha256(data).hexdigest()
    inputs[item['name']] = str(target)
    inputs[item['itemId']] = str(target)
def working_hashes(folder):
    hashes = {}
    entries = 0
    size = 0
    def visit(current, depth=0):
        nonlocal entries, size
        if depth > 16: raise RuntimeError('Python working folders exceed the supported depth')
        for path in current.iterdir():
            entries += 1
            if entries > 2000: raise RuntimeError('Python working files exceed the entry limit')
            if path.is_symlink(): continue
            if path.is_dir(): visit(path, depth + 1)
            elif path.is_file():
                size += path.stat().st_size
                if size > 250 * 1024 * 1024: raise RuntimeError('Python working files exceed 250 MB')
                hashes[path] = hashlib.sha256(path.read_bytes()).hexdigest()
    visit(folder)
    return hashes
baseline = working_hashes(output)
script = run / 'analysis.py'
code = script.read_text()
script.write_text('from pathlib import Path\nINPUT_FILES = ' + repr(inputs) + '\nOUTPUT_DIR = Path(' + repr(str(output)) + ')\nWORKSPACE_ROOT = "/mnt/shared"\n' + code)
try:
    result = subprocess.run([str(python), '-I', str(script)], cwd=str(output), env={**env, "OUTPUT_DIR": str(output), "WORKSPACE_ROOT": "/mnt/shared"}, capture_output=True, text=True, timeout=config['timeoutSeconds'])
    files = []
    visited = 0
    total_bytes = 0
    inline_bytes = 0
    def export_file(path, name):
        global inline_bytes
        data = path.read_bytes()
        file = dict(name=name, mimeType=mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        # CommonOS workspace previews cap each read at 500 KB. Keep the main
        # manifest small and use bounded payload reads for larger results.
        if inline_bytes + len(data) <= 100000:
            inline_bytes += len(data)
            file['base64'] = base64.b64encode(data).decode()
        else:
            payloads = run / 'payloads'
            payloads.mkdir(exist_ok=True)
            chunks = []
            for offset in range(0, len(data), 300000):
                part = 'payloads/' + str(len(files)) + '-' + str(offset // 300000) + '.b64'
                (run / part).write_text(base64.b64encode(data[offset:offset + 300000]).decode())
                chunks.append(part)
            file.update(chunks=chunks, size=len(data), sha256=hashlib.sha256(data).hexdigest())
        return file
    def collect(folder, depth=0):
        global visited, total_bytes
        if depth > 16: raise RuntimeError('Python output folders exceed the supported depth')
        for path in folder.iterdir():
            visited += 1
            if visited > 2000: raise RuntimeError('Python output exceeds the 2,000-entry limit')
            if path.is_symlink(): continue
            if path.is_file() and path.stat().st_size <= 25 * 1024 * 1024 and hashlib.sha256(path.read_bytes()).hexdigest() == baseline.get(path): continue
            if path.is_dir(): collect(path, depth + 1)
            elif path.is_file():
                size = path.stat().st_size
                total_bytes += size
                if size > 10 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024: raise RuntimeError('Python outputs exceed the size limit')
                if len(files) >= 100: raise RuntimeError('Python produced more than 100 output files')
                files.append(export_file(path, str(path.relative_to(output))))
    collect(output)
    for path in input_paths:
        if path.is_relative_to(output) or hashlib.sha256(path.read_bytes()).hexdigest() == input_hashes[path]: continue
        size = path.stat().st_size
        total_bytes += size
        if size > 10 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024 or len(files) >= 100: raise RuntimeError('Python outputs exceed the size limit')
        files.append(export_file(path, str(path.relative_to(run))))
    manifest = dict(exitCode=result.returncode, stdout=result.stdout[-32000:], stderr=result.stderr[-16000:], files=files, outputDirectory=str(output))
except subprocess.TimeoutExpired:
    manifest = dict(exitCode=-1, stdout='', stderr='Python execution timed out', files=[])
(run / 'result.json').write_text(json.dumps(manifest))
print(json.dumps({k: v for k, v in manifest.items() if k != 'files'}))
`;

export function cloudPythonFiles(code: string, files: Array<{ itemId: string; name: string; url: string }>, timeoutSeconds = 120, packages: string[] = [], workspaceKey?: string) {
  if (!code.trim() || code.length > 100_000) throw new Error('Provide Python code between 1 and 100,000 characters.');
  if (packages.length > 10 || packages.some((name) => !/^[a-zA-Z][a-zA-Z0-9_.-]*(?:\[[a-zA-Z0-9_,.-]+\])?(?:(?:==|>=|<=|~=)[a-zA-Z0-9_.+-]+)?$/.test(name))) throw new Error('Use package names with optional versions, without URLs or installer flags.');
  const directory = `.commons-python/runs/${randomUUID()}`;
  return { directory, files: [
    { path: `${directory}/bootstrap.py`, content: CLOUD_PYTHON_BOOTSTRAP },
    { path: `${directory}/analysis.py`, content: code },
    { path: `${directory}/inputs.json`, content: JSON.stringify({ files, packages, ...(workspaceKey ? { workingDirectory: `sessions/${createHash('sha256').update(workspaceKey).digest('hex')}/outputs` } : {}), timeoutSeconds: Math.max(1, Math.min(timeoutSeconds, 300)) }) },
  ] };
}
