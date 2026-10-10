import { createHash, randomUUID } from 'node:crypto';
import { PYTHON_DATA_PACKAGES, PYTHON_PACKAGE_SELECTION_CODE, PYTHON_FONT_PRELUDE } from '@agent-commons/agent-core';
import { CLOUD_PYTHON_PLATFORM } from './python-platform';

// Bootstrap runs in the agent's isolated CommonOS computer, never in the API
// process. A managed interpreter is installed without modifying system Python.
export const CLOUD_PYTHON_BOOTSTRAP = String.raw`import base64, fcntl, hashlib, json, mimetypes, os, platform, subprocess, sys, tarfile, urllib.request
from pathlib import Path
run = Path(__file__).resolve().parent
attempt_lock = (run / '.execute.lock').open('w')
fcntl.flock(attempt_lock, fcntl.LOCK_EX)
# CommonOS can retry a long terminal instruction. Never execute it twice or
# replace its first manifest with an empty "nothing changed" result.
if (run / 'result.json').exists():
    completed = json.loads((run / 'result.json').read_text())
    print(json.dumps({k: v for k, v in completed.items() if k != 'files'}))
    sys.exit(0)
config = json.loads((run / 'inputs.json').read_text())
root = Path('/mnt/shared/.commons-python')
if root.is_symlink(): raise RuntimeError('Python runtime folder contains a symbolic link')
root.mkdir(parents=True, exist_ok=True)
architecture = 'aarch64' if platform.machine() in ('aarch64', 'arm64') else 'x86_64'
libc = 'musl' if any(Path('/lib').glob('ld-musl-*.so.1')) else 'gnu'
python_version = '3.12.11'
triple = architecture + '-unknown-linux-' + libc
# The computer's private shared volume survives sleep and pod replacement.
# Keep interpreters/venvs at their original absolute paths, separate from chat
# outputs, and never reuse a binary from a different architecture or libc.
resources = root / 'runtime' / triple
for directory in (resources.parent, resources):
    if directory.is_symlink(): raise RuntimeError('Python runtime folder contains a symbolic link')
    directory.mkdir(exist_ok=True)
digests = {
    'aarch64-unknown-linux-gnu': '6524bd338177ed50d035d39354e12545e993bbeba2ecbddf0480c5b3a81d313f',
    'x86_64-unknown-linux-gnu': '9167d72b3319674b6303c4cbe071854bba13ebdf3d76b1a7cbdc175471fb66d6',
    'aarch64-unknown-linux-musl': 'b536543cc4d50661986b165c76ee8aa9056e4fa332edcd153ff2e98760f9359b',
    'x86_64-unknown-linux-musl': '1cff8783850e794470aadb73f54b749542a511fc57b0ce6468b64bd3852e0ade',
}
digest = digests[triple]
uv = resources / ('uv-0.12.23-' + triple)
env = {k: v for k, v in os.environ.items() if not k.startswith(('UV_', 'PYTHON', 'PIP_', 'CONDA')) and k not in ('VIRTUAL_ENV', 'LD_PRELOAD', 'LD_LIBRARY_PATH')}
env.update(UV_PYTHON_INSTALL_DIR=str(resources / 'interpreters'), UV_PYTHON_BIN_DIR=str(resources / 'bin'), UV_CACHE_DIR=str(resources / 'cache'), UV_NO_CONFIG='1', UV_PYTHON_PREFERENCE='only-managed', PYTHONNOUSERSITE='1', MPLBACKEND='Agg', MPLCONFIGDIR=str(resources / 'matplotlib'), UV_LINK_MODE='copy')
packages = config.get('packages', [])
base_packages = ${JSON.stringify(PYTHON_DATA_PACKAGES)}
${CLOUD_PYTHON_PLATFORM}
with (resources / '.prepare.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if not uv.exists():
        with urllib.request.urlopen('https://github.com/astral-sh/uv/releases/download/0.12.23/uv-' + triple + '.tar.gz', timeout=120) as response:
            archive = response.read(60 * 1024 * 1024)
        if hashlib.sha256(archive).hexdigest() != digest: raise RuntimeError('Python runtime integrity check failed')
        import io
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            member = next(m for m in tar.getmembers() if m.name.endswith('/uv') and m.isfile())
            temporary = uv.with_suffix('.download')
            temporary.write_bytes(tar.extractfile(member).read())
        temporary.chmod(0o700)
        temporary.replace(uv)
    managed_python = prepare_gnu_python() if libc == 'musl' else python_version
    def prepare(venv, requirements):
        python = venv / 'bin/python'
        if not (venv / 'commons-ready').exists():
            if not python.exists(): subprocess.run([str(uv), 'venv', '--python', str(managed_python), '--no-config', str(venv)], env=env, check=True, timeout=300)
            subprocess.run([str(uv), 'pip', 'install', '--python', str(python), '--no-config'] + requirements, env=env, check=True, timeout=300)
            subprocess.run([str(python), '-I', '-c', 'import numpy, pandas, matplotlib, scipy, sklearn, seaborn, openpyxl, PIL'], env=env, check=True)
            (venv / 'commons-ready').write_text('ready')
        return python
    def environment_key(requirements):
        return hashlib.sha256(json.dumps([python_version, sorted(requirements)]).encode()).hexdigest()[:16]
    python = prepare(resources / ('data-' + python_version + '-' + environment_key(base_packages)), base_packages)
    if packages:
        selection = subprocess.run([str(python), '-I', '-c', ${JSON.stringify(PYTHON_PACKAGE_SELECTION_CODE)}, json.dumps(packages)], env=env, check=True, capture_output=True, text=True, timeout=30)
        packages = json.loads(selection.stdout)
    if packages:
        import re
        overridden = {re.split(r'[<>=~\[]', name)[0].lower().replace('_', '-') for name in packages}
        requirements = [name for name in base_packages if name.split('==')[0] not in overridden] + packages
        python = prepare(resources / ('extension-' + environment_key(requirements)), requirements)
inputs = {}
output = root / config['workingDirectory'] if config.get('workingDirectory') else run / 'outputs'
output.mkdir(parents=True, exist_ok=True)
work = output.parent / (output.name + '.work')
work.mkdir(parents=True, exist_ok=True)
if work.is_symlink(): raise RuntimeError('Python working folder contains a symbolic link')
execution_lock = (output.parent / (output.name + '.run.lock')).open('w')
fcntl.flock(execution_lock, fcntl.LOCK_EX)
input_paths = set()
input_hashes = {}
new_inputs = set()
for item in config['files']:
    target = output / Path(item['name']).name
    if target in input_paths: target = output / (item['itemId'] + '-' + Path(item['name']).name)
    with urllib.request.urlopen(item['url'], timeout=60) as response:
        data = response.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024: raise RuntimeError('Input file exceeds 25 MB')
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != hashlib.sha256(data).hexdigest():
        target = run / 'revised-inputs' / item['itemId'] / Path(item['name']).name
        target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(data)
        new_inputs.add(target)
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
publication = output.parent / (output.name + '.published.json')
if publication.exists():
    baseline = {output / name: digest for name, digest in json.loads(publication.read_text()).items()}
else:
    baseline = working_hashes(output)
for path in new_inputs:
    if path.is_relative_to(output): baseline[path] = input_hashes[path]
def save_publication(hashes):
    temporary = publication.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({str(path.relative_to(output)): digest for path, digest in hashes.items()}))
    temporary.replace(publication)
# The API acknowledges actual Library persistence, using separate files so
# concurrent uploads cannot overwrite each other's publication state.
acknowledgements = output.parent / (output.name + '.acks')
consumed = []
if acknowledgements.exists():
    if acknowledgements.is_symlink(): raise RuntimeError('Python publication folder contains a symbolic link')
    for acknowledgement in acknowledgements.glob('*.json'):
        if acknowledgement.is_symlink(): raise RuntimeError('Python publication record contains a symbolic link')
        for name, digest in json.loads(acknowledgement.read_text()).items():
            path = Path(name)
            if path.is_absolute() or not name or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')):
                raise RuntimeError('Invalid Python publication filename')
            if not isinstance(digest, str) or len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest):
                raise RuntimeError('Invalid Python publication hash')
            baseline[output / path] = digest
        consumed.append(acknowledgement)
save_publication(baseline)
for acknowledgement in consumed: acknowledgement.unlink()
script = run / 'analysis.py'
code = script.read_text()
script.write_text('from pathlib import Path\nINPUT_FILES = ' + repr(inputs) + '\nOUTPUT_DIR = Path(' + repr(str(output)) + ')\nWORK_DIR = Path(' + repr(str(work)) + ')\nWORKSPACE_ROOT = "/mnt/shared"\n' + ${JSON.stringify(PYTHON_FONT_PRELUDE)} + code)
try:
    result = subprocess.run([str(python), '-I', str(script)], cwd=str(output), env={**env, "OUTPUT_DIR": str(output), "WORK_DIR": str(work), "WORKSPACE_ROOT": "/mnt/shared"}, capture_output=True, text=True, timeout=config['timeoutSeconds'])
    files = []
    visited = 0
    total_bytes = 0
    inline_bytes = 0
    def export_file(path, name):
        global inline_bytes
        data = path.read_bytes()
        if path.suffix.lower() == '.json':
            def invalid_constant(value): raise ValueError('Invalid JSON constant ' + value + '; encode missing values as null and use finite numbers')
            json.loads(data, parse_constant=invalid_constant)
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
                if len(files) >= 100: raise RuntimeError('Python produced more than 100 output files. Keep extracted sources and intermediate files in WORK_DIR; save only requested deliverables in OUTPUT_DIR.')
                files.append(export_file(path, str(path.relative_to(output))))
    if result.returncode == 0: collect(output)
    for path in input_paths if result.returncode == 0 else []:
        if path.is_relative_to(output) or hashlib.sha256(path.read_bytes()).hexdigest() == input_hashes[path]: continue
        size = path.stat().st_size
        total_bytes += size
        if size > 10 * 1024 * 1024 or total_bytes > 25 * 1024 * 1024 or len(files) >= 100: raise RuntimeError('Python outputs exceed the size limit')
        files.append(export_file(path, str(path.relative_to(run))))
    manifest = dict(exitCode=result.returncode, stdout=result.stdout[-32000:], stderr=result.stderr[-16000:], files=files, outputDirectory=str(output))
except subprocess.TimeoutExpired:
    manifest = dict(exitCode=-1, stdout='', stderr='Python execution timed out', files=[])
except (ValueError, RuntimeError) as error:
    manifest = dict(exitCode=-1, stdout='', stderr=str(error), files=[])
temporary_manifest = run / 'result.json.tmp'
temporary_manifest.write_text(json.dumps(manifest))
temporary_manifest.replace(run / 'result.json')
print(json.dumps({k: v for k, v in manifest.items() if k != 'files'}))
`;

export function cloudPythonFiles(code: string, files: Array<{ itemId: string; name: string; url: string }>, timeoutSeconds = 120, packages: string[] = [], workspaceKey?: string) {
  if (!code.trim() || code.length > 100_000) throw new Error('Provide Python code between 1 and 100,000 characters.');
  if (packages.length > 10 || packages.some((name) => !/^[a-zA-Z][a-zA-Z0-9_.-]*(?:\[[a-zA-Z0-9_,.-]+\])?(?:(?:==|>=|<=|~=)[a-zA-Z0-9_.+-]+)?$/.test(name))) throw new Error('Use package names with optional versions, without URLs or installer flags.');
  const directory = `.commons-python/runs/${randomUUID()}`;
  const workingDirectory = workspaceKey ? `sessions/${createHash('sha256').update(workspaceKey).digest('hex')}/outputs` : undefined;
  const publicationAcknowledgementPath = workingDirectory
    ? `.commons-python/${workingDirectory}.acks/${directory.split('/').at(-1)}.json`
    : `${directory}/outputs.acks/${directory.split('/').at(-1)}.json`;
  return { directory, publicationAcknowledgementPath, files: [
    { path: `${directory}/bootstrap.py`, content: CLOUD_PYTHON_BOOTSTRAP },
    { path: `${directory}/analysis.py`, content: code },
    { path: `${directory}/inputs.json`, content: JSON.stringify({ files, packages, ...(workingDirectory ? { workingDirectory } : {}), timeoutSeconds: Math.max(1, Math.min(timeoutSeconds, 300)) }) },
  ] };
}
