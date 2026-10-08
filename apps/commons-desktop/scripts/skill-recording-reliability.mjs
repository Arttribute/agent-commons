import { build } from 'tsup';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Uses generated canvas pixels and audio tones. Never captures a user's screen.
const app = resolve(import.meta.dirname, '..');
const output = mkdtempSync(join(tmpdir(), 'commons-recording-test-'));
try {
  await build({ entry: { renderer: join(app, 'scripts/fixtures/skill-recording-renderer.tsx') }, outDir: output, format: ['iife'], platform: 'browser', target: 'chrome120', noExternal: [/react/], silent: true, esbuildOptions(options) { const require = createRequire(import.meta.url); options.alias = { react: dirname(require.resolve('react/package.json')), 'react-dom': dirname(require.resolve('react-dom/package.json')) }; }, define: { 'process.env.NODE_ENV': '"production"' } });
  writeFileSync(join(output, 'index.html'), '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; media-src &#39;self&#39; blob:; img-src &#39;self&#39; data:"><div id="app"></div><script src="renderer.global.js"></script>');
  writeFileSync(join(output, 'main.cjs'), `
    const { app, BrowserWindow } = require('electron');
    const fs = require('node:fs');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    app.whenReady().then(async () => {
      const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
      window.webContents.on("console-message", (_event, level, message) => { if (level >= 2) console.error(message); });
      await window.loadFile(${JSON.stringify(join(output, 'index.html'))});
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const result = await window.webContents.executeJavaScript('window.__recordingResult');
        if (result) {
          if (result.passed && process.env.COMMONS_RECORDING_TEST_ROOT) {
            fs.mkdirSync(process.env.COMMONS_RECORDING_TEST_ROOT, { recursive: true });
            fs.writeFileSync(require('node:path').join(process.env.COMMONS_RECORDING_TEST_ROOT, 'workflow-recording.webm'), Buffer.from(result.recordingBase64, 'base64'));
            fs.writeFileSync(require('node:path').join(process.env.COMMONS_RECORDING_TEST_ROOT, 'recording-evidence.json'), JSON.stringify({ durationMs: result.durationMs, frames: result.frames }));
          }
          delete result.recordingBase64; delete result.frames;
          console.log(JSON.stringify(result)); app.exit(result.passed ? 0 : 1); return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.error('Recording test timed out'); app.exit(1);
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(createRequire(import.meta.url)('electron'), [join(output, 'main.cjs'), '--user-data-dir=' + join(output, 'browser-profile')], { env: environment, encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Real browser recording checks failed (${result.status})`);
} finally { rmSync(output, { recursive: true, force: true }); }
