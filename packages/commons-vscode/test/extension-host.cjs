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
  const commands = await vscode.commands.getCommands(true);
  for (const name of [
    'open',
    'start',
    'resume',
    'selectAgent',
    'login',
    'logout',
    'review',
    'explain',
    'refresh',
    'settings',
    'stop',
    'attach',
  ])
    assert.ok(commands.includes(`agentCommons.${name}`));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'commons-host-test-'));
  const capture = path.join(fixture, 'capture.json');
  const executable = path.join(fixture, 'fixture-node');
  await fs.writeFile(
    executable,
    `#!/usr/bin/env node
const fs = require('node:fs');
process.on('message', m => {
  let result;
  if (m.method === 'account') result = {authenticated:true,userId:'fixture-user',name:'Fixture User'};
  else if (m.method === 'sessions') result = [];
  else if (m.method === 'send') {
    fs.writeFileSync(${JSON.stringify(
      capture
    )}, JSON.stringify({ args:process.argv.slice(2), input:m.params, nodeOptions:process.env.NODE_OPTIONS }));
    const session = {sessionId:'host-fixture',agentId:'agent-1',title:'Explain code'};
    process.send({event:{type:'session',session}});
    process.send({event:{type:'token',content:'This explains the selected code.'}});
    result = session;
  }
  process.send({id:m.id,result});
});
`,
    { mode: 0o700 }
  );
  try {
    await vscode.workspace
      .getConfiguration('agentCommons')
      .update('nodePath', executable, vscode.ConfigurationTarget.Global);
    const terminalCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('agentCommons.open');
    await vscode.commands.executeCommand('agentCommons.refresh');
    await vscode.commands.executeCommand('agentCommons.start');
    assert.equal(vscode.window.terminals.length, terminalCount, 'New chat never opens a terminal');
    const folder = vscode.workspace.workspaceFolders[0];
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(folder.uri, 'README.md')
    );
    const editor = await vscode.window.showTextDocument(doc);
    await editor.edit((edit) =>
      edit.insert(new vscode.Position(0, 0), 'unsaved fixture: $(echo do-not-execute)\n')
    );
    editor.selection = new vscode.Selection(0, 0, 0, 37);
    await vscode.commands.executeCommand('agentCommons.explain');
    const record = JSON.parse(await fs.readFile(capture, 'utf8'));
    assert.equal(record.input.mode, 'read-only');
    assert.match(record.input.attachments[0].text, /unsaved fixture/);
    assert.match(record.input.attachments[0].name, /unsaved buffer/);
    assert.equal(record.input.root, folder.uri.fsPath);
    assert.equal(record.nodeOptions, undefined);
    assert.equal(record.args.length, 1, 'Prompt and credentials stay out of argv');
    assert.match(record.args[0], /runtime.cjs$/);
    assert.equal(vscode.window.terminals.length, terminalCount, 'Responses never open a terminal');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    console.log(
      'PASS: real extension host activation, chat commands, IPC streaming, and unsaved read-only editor context without a terminal'
    );
  } finally {
    await vscode.commands.executeCommand('agentCommons.stop');
    await vscode.workspace
      .getConfiguration('agentCommons')
      .update('nodePath', undefined, vscode.ConfigurationTarget.Global);
    await fs.rm(fixture, { recursive: true, force: true });
  }
};
