import { Command } from 'commander';
import * as readline from 'readline';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, spin, detail, printError, jsonOut } from '../ui.js';
import {
  buildLocalToolsManifest,
  buildDirSnapshot,
  runLocalTool,
  type LocalToolsConfig,
} from '../local-tools.js';

export function runCommand(): Command {
  return new Command('run')
    .description('Send a single prompt to an agent and stream the response')
    .argument('<prompt>', 'Prompt text to send')
    .option('--agent <agentId>', 'Agent ID')
    .option('--session <sessionId>', 'Resume an existing session by ID')
    .option('--new-session', 'Create a new session and print its ID for future use')
    .option('--local', 'Enable local file system access (with permission prompts)')
    .option('-y, --yes', 'Enable local file system access and auto-approve all operations')
    .option('--no-stream', 'Disable streaming (wait for full response)')
    .option('--json', 'Output raw event stream as JSON lines')
    .action(async (prompt: string, opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }

      if (opts.session && opts.newSession) {
        console.error(c.error('Cannot use --session and --new-session together.'));
        process.exit(1);
      }

      const client = makeClient();
      let sessionId: string | undefined = opts.session;

      // Validate an existing session
      if (opts.session) {
        const spinner = spin('Loading session…');
        try {
          await client.sessions.get(opts.session);
          spinner.stop();
        } catch {
          spinner.stop();
          console.error(c.error(`Session "${opts.session}" not found.`));
          process.exit(1);
        }
      }

      // Create a new session when requested
      if (opts.newSession) {
        const spinner = spin('Creating session…');
        try {
          const res = await client.sessions.create({
            agentId,
            initiator: cfg.initiator ?? '',
            title: `agc run ${new Date().toISOString().slice(0, 16)}`,
            source: 'cli',
          });
          const session = (res as any)?.data ?? res;
          sessionId = session.sessionId;
          spinner.stop();
        } catch (err) {
          spinner.stop();
          printError(err);
          process.exit(1);
        }
      }

      // ── Local tools setup ────────────────────────────────────────────────────
      const localEnabled = opts.yes || opts.local;
      const autoApprove = !!opts.yes;
      let localToolsCfg: LocalToolsConfig | null = null;
      let cliContext: string | undefined;

      if (localEnabled) {
        const rootDir = process.cwd();
        localToolsCfg = {
          rootDir,
          sessionId: sessionId ?? 'run',
          appendLog: () => {},
          permissions: new Map(),
          agentId,
          autoApprove,
        };
        const snapshot = buildDirSnapshot(rootDir, 2);
        cliContext = buildLocalToolsManifest(rootDir, snapshot, [], autoApprove);
      }

      // Show session header when a session is in use (unless outputting raw JSON)
      if (!opts.json) {
        const rows: [string, string][] = [];
        if (sessionId) {
          const label = opts.newSession ? `${c.id(sessionId)}${c.dim(' (new)')}` : `${c.id(sessionId)}${c.dim(' (resumed)')}`;
          rows.push(['Session', label]);
        }
        if (localEnabled) {
          rows.push(['Local tools', autoApprove ? c.warn('enabled  (auto-approve on)') : c.success('enabled')]);
        }
        if (rows.length) { detail(rows); console.log(); }
      }

      const params = {
        agentId,
        sessionId,
        messages: [{ role: 'user' as const, content: prompt }],
        ...(cfg.initiator && { initiatorId: cfg.initiator }),
        ...(cliContext && { cliContext }),
      };

      if (opts.noStream) {
        const spinner = spin('Running…');
        try {
          const result = await client.run.once(params);
          spinner.stop();
          if (opts.json) return jsonOut(result);
          const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result);
          console.log(text);
          if (sessionId) console.log(c.dim(`\nSession: ${sessionId}  (resume with: agc run --session ${sessionId} "<prompt>")`));
        } catch (err) {
          spinner.stop();
          printError(err);
          process.exit(1);
        }
        return;
      }

      // Streaming mode
      try {
        let hasOutput = false;
        let toolStartMs = 0;
        let lastToolName = '';
        for await (const event of client.agents.stream(params)) {
          if (opts.json) {
            console.log(JSON.stringify(event));
            continue;
          }
          if (event.type === 'token') {
            process.stdout.write((event as any).content ?? '');
            hasOutput = true;
          } else if (event.type === 'cli_tool_request' && localToolsCfg) {
            const { requestId, tool: toolName, args } = event as any;
            const displayName = String(toolName).replace('cli_', '');
            if (hasOutput) { process.stdout.write('\n'); hasOutput = false; }
            process.stdout.write(`  ${c.dim('─')} ${c.bold(displayName)}`);
            const startMs = Date.now();
            let result: string;
            let toolOk = true;
            try {
              result = await runLocalTool({ tool: displayName, args: args ?? {} }, localToolsCfg);
            } catch (err: any) {
              result = `Error: ${err?.message ?? String(err)}`;
              toolOk = false;
            }
            const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            process.stdout.write(`  ${c.dim('─')} ${c.bold(displayName)}  ${toolOk ? sym.ok : sym.fail}  ${c.dim('(' + elapsed + 's)')}\n`);
            try {
              await fetch(`${cfg.apiUrl}/v1/agents/cli-tool-result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
                body: JSON.stringify({ requestId, result }),
              });
            } catch { /* non-fatal */ }
          } else if (event.type === 'toolStart') {
            lastToolName = (event as any).toolName ?? '';
            toolStartMs = Date.now();
            if (hasOutput) { process.stdout.write('\n'); hasOutput = false; }
            process.stdout.write(`  ${c.dim('─')} ${c.bold(lastToolName)}`);
          } else if (event.type === 'toolEnd') {
            const elapsed = ((Date.now() - toolStartMs) / 1000).toFixed(1);
            readline.cursorTo(process.stdout, 0);
            readline.clearLine(process.stdout, 0);
            process.stdout.write(`  ${c.dim('─')} ${c.bold(lastToolName)}  ${sym.ok}  ${c.dim('(' + elapsed + 's)')}\n`);
          } else if (event.type === 'final') {
            if (hasOutput) process.stdout.write('\n');
            const e = event as any;
            if (e.content && !hasOutput) console.log(e.content);
            if (sessionId) console.log(c.dim(`\nSession: ${sessionId}  (resume with: agc run --session ${sessionId} "<prompt>")`));
            break;
          } else if (event.type === 'error') {
            if (hasOutput) process.stdout.write('\n');
            console.error(`\n${sym.fail} ${c.error((event as any).message ?? 'Error')}`);
            process.exit(1);
          }
        }
        if (hasOutput && !opts.json) process.stdout.write('\n');
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });
}
