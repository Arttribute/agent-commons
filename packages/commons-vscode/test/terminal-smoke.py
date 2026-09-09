"""Exercise the bundled CLI in a real PTY against a local Commons API fixture.
Requires macOS/Linux and Python 3; never reads the developer's Commons account.
"""
import json, os, pty, select, shutil, subprocess, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

bundle = Path(__file__).resolve().parents[1] / 'dist/cli.cjs'
node = shutil.which('node')


def scenario(read_only=False, resume=False, answer='y'):
    with tempfile.TemporaryDirectory(prefix='commons-terminal-test-') as directory:
        root = Path(directory)
        (root / 'AGENTS.md').write_text('Always verify the resulting change.')
        (root / 'prompt.txt').write_text('Create a greeting file.\nKeep it simple.')
        (root / '.agc').mkdir()
        (root / '.agc/config.json').write_text(json.dumps({'apiKey': 'fixture-key', 'initiator': 'fixture-user', 'defaultAgentId': 'agent-1'}))
        (root / 'home.cjs').write_text('require("node:os").homedir = () => ' + json.dumps(directory) + ';')
        calls, results = [], []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                data = {'data': {'agentId': 'original-agent' if resume else 'agent-1', 'name': 'Fixture agent'}}
                if 'wallet' in self.path: data = {'data': None}
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps(data).encode())
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
                if self.path == '/v1/agents/run/stream':
                    calls.append(body)
                    self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.end_headers()
                    def event(data):
                        self.wfile.write(('data: ' + json.dumps(data) + '\n\n').encode()); self.wfile.flush()
                    event({'type': 'token', 'content': 'Preparing the greeting.'})
                    event({'type': 'cli_tool_request', 'requestId': 'tool-1', 'tool': 'cli_write_file', 'args': {'path': 'hello.txt', 'content': 'Hello Commons'}})
                    for _ in range(200):
                        if results: break
                        time.sleep(.05)
                    event({'type': 'token', 'content': ' Finished fixture task.'})
                    event({'type': 'final', 'payload': {'usage': {'totalTokens': 12}}})
                elif self.path == '/v1/agents/cli-tool-result':
                    results.append(body)
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b'{}')
                else:
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b'{"data":{"sessionId":"fixture-session"}}')
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        master, slave = pty.openpty()
        env = {k:v for k,v in os.environ.items() if not k.startswith(('AGC_', 'COMMONS_')) and k not in ('NODE_OPTIONS', 'NODE_PATH')}
        env['AGC_API_URL'] = f'http://127.0.0.1:{server.server_port}'
        env['NO_COLOR'] = '1'
        args = [node, '--require', str(root / 'home.cjs'), str(bundle), 'code', '--prompt-file', str(root / 'prompt.txt')]
        if read_only: args.append('--read-only')
        if resume: args.extend(['--resume', 'fixture-session', '--agent', 'wrong-agent'])
        process = subprocess.Popen(args, stdin=slave, stdout=slave, stderr=slave, cwd=root, env=env)
        os.close(slave)
        output, replied, quit_sent = '', False, False
        try:
            deadline = time.time() + 20
            while time.time() < deadline and process.poll() is None:
                if select.select([master], [], [], .1)[0]:
                    try: output += os.read(master, 65536).decode(errors='replace')
                    except OSError: break
                if '[y] Yes' in output and not replied:
                    os.write(master, (answer + '\n').encode()); replied = True
                if 'Finished fixture task.' in output and not quit_sent:
                    time.sleep(.1); os.write(master, b'/quit\n'); quit_sent = True
            assert process.wait(timeout=3) == 0, output
            assert len(calls) == 1, output
            assert calls[0]['sessionId'] == 'fixture-session', output
            assert calls[0]['messages'][0]['content'] == 'Create a greeting file.\nKeep it simple.'
            assert 'Always verify' in calls[0]['cliContext']
            assert calls[0]['agentId'] == ('original-agent' if resume else 'agent-1'), (calls, output)
            assert results and results[0]['requestId'] == 'tool-1', output
            if read_only or answer != 'y':
                assert not (root / 'hello.txt').exists(), output
                assert 'denied' in results[0]['result'], output
            else:
                assert (root / 'hello.txt').read_text() == 'Hello Commons', output
            assert not (root / '.git/hooks/prepare-commit-msg').exists()
        finally:
            if process.poll() is None: process.kill(); process.wait()
            os.close(master); server.shutdown(); server.server_close()
        print(f'PASS terminal: read_only={read_only}, resume={resume}, answer={answer!r}')

scenario()
scenario(read_only=True)
scenario(resume=True)
scenario(answer='')
scenario(answer='n')
