import assets from './python-platform-assets.json';

/** App-owned glibc on Alpine permits ordinary manylinux data/ML/CUDA wheels. */
export const CLOUD_PYTHON_PLATFORM = String.raw`
def prepare_gnu_python():
    import io, re
    libraries = resources / 'gnu-libraries-2.41-gcc14'
    libraries.mkdir(exist_ok=True)
    patcher = resources / 'patchelf-0.18.0'
    selected = [item for item in ${JSON.stringify(assets)} if item['architecture'] == architecture]
    def verified_download(item):
        with urllib.request.urlopen(item['url'], timeout=120) as response:
            data = response.read(10 * 1024 * 1024 + 1)
        if len(data) != item['size'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            raise RuntimeError('Managed platform integrity check failed: ' + item['type'])
        return data
    marker = libraries / 'ready.json'
    if not marker.exists():
        for item in selected:
            data = verified_download(item)
            if item['type'] == 'patchelf':
                with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz', ignore_zeros=True) as archive:
                    member = next(member for member in archive if member.name == 'usr/bin/patchelf' and member.isfile())
                    patcher.write_bytes(archive.extractfile(member).read())
                patcher.chmod(0o700)
                continue
            if data[:8] != b'!<arch>\n': raise RuntimeError('Invalid managed platform archive')
            cursor = 8
            payload = None
            while cursor + 60 <= len(data):
                header = data[cursor:cursor+60]
                length = int(header[48:58].decode().strip())
                name = header[:16].decode().strip().rstrip('/')
                if name.startswith('data.tar'): payload = data[cursor+60:cursor+60+length]; break
                cursor += 60 + length + length % 2
            if payload is None: raise RuntimeError('Managed platform archive has no files')
            with tarfile.open(fileobj=io.BytesIO(payload), mode='r:*') as archive:
                links = []
                for member in archive:
                    name = Path(member.name).name
                    if member.isfile() and member.name.endswith('/copyright'):
                        (libraries / (item['type'] + '-copyright.txt')).write_bytes(archive.extractfile(member).read())
                    if not re.fullmatch(r'(?:lib[a-zA-Z0-9_+.-]+|ld-linux[a-zA-Z0-9_.-]+)\.so(?:\.[0-9.]+)?', name): continue
                    target = libraries / name
                    if member.isfile():
                        target.write_bytes(archive.extractfile(member).read())
                        target.chmod(0o700 if name.startswith('ld-linux') else 0o600)
                    elif member.issym(): links.append((target, Path(member.linkname).name))
                for target, name in links:
                    if target.name != name and not target.exists(): target.symlink_to(name)
        marker.write_text(json.dumps(selected))
    env['UV_LIBC'] = 'gnu'
    loader = libraries / ('ld-linux-x86-64.so.2' if architecture == 'x86_64' else 'ld-linux-aarch64.so.1')
    rpath = str(libraries) + ':$ORIGIN/../lib:/usr/local/nvidia/lib64:/usr/local/nvidia/lib'
    prepared = resources / 'gnu-python-3.12.11-ready.json'
    interpreters = list((resources / 'interpreters').glob('cpython-3.12.11-linux-' + architecture + '-gnu/bin/python3.12'))
    if len(interpreters) == 1:
        executable = interpreters[0].resolve()
        expected = dict(executable=str(executable), loader=str(loader), rpath=rpath)
        if prepared.exists() and json.loads(prepared.read_text()) == expected:
            # A replacement pod needs only the retained interpreter/loader,
            # not another installer call or the host libraries for patchelf.
            subprocess.run([str(executable), '-I', '-c', 'import ctypes, ssl, socket'], env=env, check=True, timeout=30)
            return executable
    subprocess.run([str(uv), 'python', 'install', '--no-config', '3.12.11'], env=env, check=True, timeout=300)
    interpreters = list((resources / 'interpreters').glob('cpython-3.12.11-linux-' + architecture + '-gnu/bin/python3.12'))
    if len(interpreters) != 1: raise RuntimeError('Managed GNU Python was not installed')
    executable = interpreters[0].resolve()
    if not loader.is_file(): raise RuntimeError('Managed GNU loader is missing')
    subprocess.run([str(patcher), '--set-interpreter', str(loader), '--force-rpath', '--set-rpath', rpath, str(executable)], env=env, check=True, timeout=30)
    subprocess.run([str(executable), '-I', '-c', 'import ctypes, ssl, socket; print("Managed GNU Python verified")'], env=env, check=True, timeout=30)
    prepared.write_text(json.dumps(dict(executable=str(executable), loader=str(loader), rpath=rpath)))
    return executable
`;
