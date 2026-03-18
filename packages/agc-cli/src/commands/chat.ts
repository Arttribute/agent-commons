import { Command } from 'commander';
import * as readline from 'readline';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, spin, detail, printError } from '../ui.js';

const HELP_TEXT = `
  ${c.label('Slash commands')}
  /help          Show this help
  /session       Print the current session ID (copy it to resume later)
  /clear         Clear the terminal screen
  /quit          Exit (session is preserved — resume with --resume <id>)
`;

export function chatCommand(): Command {
  return new Command('chat')
    .description('Start an interactive chat REPL with an agent')
    .option('--agent <agentId>', 'Agent ID (or set defaultAgentId in config)')
    .option('--resume <sessionId>', 'Resume an existing session by ID')
    .option('--no-stream', 'Disable token streaming (wait for full response)')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }

      const client = makeClient();
      let sessionId: string = opts.resume ?? '';
      const isResume = !!opts.resume;

      if (!isResume) {
        // Create a fresh session
        const spinner = spin('Creating session…');
        try {
          const res = await client.sessions.create({
            agentId,
            initiator: cfg.initiator,
            title: `agc chat ${new Date().toISOString().slice(0, 16)}`,
          });
          const session = (res as any)?.data ?? res;
          sessionId = session.sessionId;
          spinner.stop();
        } catch (err) {
          spinner.stop();
          printError(err);
          process.exit(1);
        }
      } else {
        // Validate the session exists before entering the REPL
        const spinner = spin('Loading session…');
        try {
          const res = await client.sessions.get(sessionId);
          const session = (res as any)?.data ?? res;
          // If the session belongs to a different agent, warn but continue
          if (session.agentId && session.agentId !== agentId) {
            spinner.stop();
            console.log(c.warn(`  Note: session ${sessionId} was created with agent ${session.agentId}, not ${agentId}`));
          } else {
            spinner.stop();
          }
        } catch {
          spinner.stop();
          console.error(c.error(`Session "${sessionId}" not found.`));
          process.exit(1);
        }
      }

      // ── Wallet info (non-blocking) ───────────────────────────────────────────
      let walletLine = '';
      try {
        const primary = await client.wallets.primary(agentId);
        const w = (primary as any)?.data ?? primary;
        if (w?.id) {
          const bal = await client.wallets.balance(w.id).catch(() => null);
          const b = (bal as any)?.data ?? bal;
          const addr = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
          const usdc = b?.usdc ?? '0';
          walletLine = `${addr}  ${c.bold(usdc + ' USDC')}`;
        }
      } catch { /* non-critical */ }

      // ── Header ──────────────────────────────────────────────────────────────
      console.log(`\n${c.bold('Agent Commons Chat')}`);
      const headerRows: [string, string][] = [
        ['Agent',   agentId],
        ['Session', c.id(sessionId) + (isResume ? c.dim(' (resumed)') : c.dim(' (new)'))],
      ];
      if (walletLine) headerRows.push(['Wallet', walletLine]);
      detail(headerRows);
      console.log(c.dim('\nType your message and press Enter. Type /help for commands.\n'));

      // ── Readline REPL ────────────────────────────────────────────────────────
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: c.primary('you') + c.dim(' › '),
      });

      rl.prompt();

      rl.on('line', async (line: string) => {
        const input = line.trim();

        if (!input) {
          rl.prompt();
          return;
        }

        // ── Slash commands ───────────────────────────────────────────────────
        if (input === '/quit' || input === '/exit' || input === '/q') {
          console.log(c.dim(`\nSession saved. Resume with: agc chat --resume ${sessionId}`));
          rl.close();
          process.exit(0);
        }

        if (input === '/help') {
          console.log(HELP_TEXT);
          rl.prompt();
          return;
        }

        if (input === '/session') {
          console.log(c.dim(`  ${sessionId}`));
          console.log(c.dim(`  Resume with: agc chat --resume ${sessionId}`));
          rl.prompt();
          return;
        }

        if (input === '/clear') {
          process.stdout.write('\x1b[2J\x1b[H');
          rl.prompt();
          return;
        }

        if (input.startsWith('/')) {
          console.log(c.warn(`  Unknown command "${input}". Type /help for available commands.`));
          rl.prompt();
          return;
        }

        // ── Send message ─────────────────────────────────────────────────────
        rl.pause();

        const params = {
          agentId,
          sessionId,
          messages: [{ role: 'user' as const, content: input }],
        };

        process.stdout.write(c.primary('agent') + c.dim(' › '));

        if (opts.noStream) {
          const spinner = spin('');
          try {
            const result = await client.run.once(params);
            spinner.stop();
            const text = extractText(result);
            console.log(text);
          } catch (err) {
            spinner.stop();
            console.error(`\n${sym.fail} ${c.error((err as Error).message ?? String(err))}`);
          }
        } else {
          try {
            let hasOutput = false;
            for await (const event of client.agents.stream(params)) {
              if (event.type === 'token') {
                process.stdout.write((event as any).content ?? '');
                hasOutput = true;
              } else if (event.type === 'toolStart') {
                // Show tool invocation inline so the user knows the agent is working
                const name = (event as any).toolName ?? '';
                if (hasOutput) process.stdout.write('\n');
                process.stdout.write(c.dim(`  [tool] ${name}…`));
                hasOutput = false;
              } else if (event.type === 'toolEnd') {
                process.stdout.write(c.dim(' done\n'));
                process.stdout.write(c.primary('agent') + c.dim(' › '));
                hasOutput = false;
              } else if (event.type === 'final') {
                const e = event as any;
                const text = extractText(e?.payload);
                if (text && !hasOutput) process.stdout.write(text);
                // ── Cost/usage footer ──────────────────────────────────────
                const usage = e?.payload?.usage;
                if (usage) {
                  const tokens = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
                  const cost   = typeof usage.costUsd === 'number' ? `$${usage.costUsd.toFixed(4)}` : '';
                  const parts  = [tokens ? `${tokens.toLocaleString()} tokens` : '', cost].filter(Boolean);
                  if (parts.length) process.stdout.write('\n' + c.dim(`  ↳ ${parts.join(' · ')}`));
                }
                break;
              } else if (event.type === 'error') {
                if (hasOutput) process.stdout.write('\n');
                console.error(`\n${sym.fail} ${c.error((event as any).message ?? 'Stream error')}`);
                break;
              }
            }
            process.stdout.write('\n');
          } catch (err) {
            process.stdout.write('\n');
            console.error(`${sym.fail} ${c.error((err as Error).message ?? String(err))}`);
          }
        }

        console.log();
        rl.resume();
        rl.prompt();
      });

      rl.on('close', () => {
        process.exit(0);
      });

      process.on('SIGINT', () => {
        console.log(c.dim(`\nSession preserved. Resume with: agc chat --resume ${sessionId}`));
        process.exit(130);
      });
    });
}

function extractText(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.content === 'string') return payload.content;
  if (Array.isArray(payload.content)) {
    return payload.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('\n');
  }
  if (payload.text) return payload.text;
  if (payload.message) return payload.message;
  return JSON.stringify(payload);
}
