const assert = require('node:assert/strict');
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
exports.run = async function () {
  const manifest = require('../package.json');
  const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`);
  assert.ok(extension, 'Extension is discoverable');
  await extension.activate();
  assert.equal(extension.isActive, true);
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['open', 'start', 'resume', 'selectAgent', 'login', 'logout', 'review', 'explain', 'refresh', 'settings']) {
    assert.ok(commands.includes(`agentCommons.${name}`), `Command registered: ${name}`);
  }
  await vscode.commands.executeCommand('agentCommons.open');
  await vscode.commands.executeCommand('agentCommons.refresh');
  // Replace Node only in this isolated test profile. Capture the real terminal's
  // arguments without signing in or sending editor content to any service.
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'commons-host-test-'));
  const capture = path.join(fixture, 'capture.json');
  const executable = path.join(fixture, 'fixture-node');
  await fs.writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === '--version') { console.log('v22.0.0'); process.exit(0); }
const args = process.argv.slice(2);
const promptFile = args[args.indexOf('--prompt-file') + 1];
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ args, cwd: process.cwd(), prompt: fs.readFileSync(promptFile, 'utf8'), nodeOptions: process.env.NODE_OPTIONS }));
`, { mode: 0o700 });
  try {
    await vscode.workspace.getConfiguration('agentCommons').update('nodePath', executable, vscode.ConfigurationTarget.Global);
    const folder = vscode.workspace.workspaceFolders[0];
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, 'README.md'));
    const editor = await vscode.window.showTextDocument(document);
    await editor.edit(edit => edit.insert(new vscode.Position(0, 0), 'unsaved fixture: $(echo do-not-execute)\n'));
    editor.selection = new vscode.Selection(0, 0, 0, 37);
    await vscode.commands.executeCommand('agentCommons.explain');
    for (let i = 0; i < 100; i++) {
      try { await fs.access(capture); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    const record = JSON.parse(await fs.readFile(capture, 'utf8'));
    assert.ok(record.args.includes('code'));
    assert.ok(record.args.includes('--read-only'));
    assert.ok(record.args.includes('--prompt-file'));
    assert.match(record.prompt, /unsaved fixture/);
    assert.match(record.prompt, /unsaved buffer/);
    assert.equal(record.cwd, folder.uri.fsPath);
    assert.equal(record.nodeOptions, undefined);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    for (const terminal of vscode.window.terminals) if (terminal.name.startsWith('Commons')) terminal.dispose();
    console.log('PASS: extension activation, sidebar, and native terminal launch with unsaved editor context');
  } finally {
    await vscode.workspace.getConfiguration('agentCommons').update('nodePath', undefined, vscode.ConfigurationTarget.Global);
    await fs.rm(fixture, { recursive: true, force: true });
  }
};
