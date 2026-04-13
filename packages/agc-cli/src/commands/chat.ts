import { Command } from 'commander';
import * as readline from 'readline';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, spin, detail, printError } from '../ui.js';
import {
  buildLocalToolsManifest,
  buildDirSnapshot,
  readFileForContext,
  extractToolCall,
  runLocalTool,
  type LocalToolsConfig,
} from '../local-tools.js';

// ── Local session log (JSONL, one record per line) ────────────────────────────

const SESSIONS_DIR = join(homedir(), '.agc', 'sessions');

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function appendSessionLog(sessionId: string, record: Record<string, unknown>): void {
  try {
    ensureSessionsDir();
    const file = join(SESSIONS_DIR, `${sessionId}.jsonl`);
    appendFileSync(file, JSON.stringify(record) + '\n', { mode: 0o600 });
  } catch {
    // Non-critical — never crash the chat over a log write
  }
}

const HELP_TEXT = `
  ${c.label('Slash commands')}
  /help          Show this help
  /session       Print the current session ID (copy it to resume later)
  /tools         Show local tool status and permissions
  /clear         Clear the terminal screen
  /quit          Exit (session is preserved — resume with --resume <id>)

  ${c.label('File context')}
  Use @path/to/file in your message to inject that file's contents into context.
  Example: "review @src/index.ts and suggest improvements"
`;

const LOCAL_TOOLS_DISCLAIMER = `
  ${c.warn('⚠')}  ${c.bold('Local file system access enabled')}

  ${c.dim('The agent can read and write files, list directories, search files,')}
  ${c.dim('and execute shell commands on your machine.')}

  ${c.dim('Rules:')}
  ${sym.bullet} ${c.dim('All paths are restricted to:')} ${c.primary(process.cwd())}
  ${sym.bullet} ${c.dim('Sensitive paths (.ssh, .env, .aws, credentials) are always blocked')}
  ${sym.bullet} ${c.dim('Write and run_command operations require your confirmation')}
  ${sym.bullet} ${c.dim('You can deny any individual request')}

  ${c.dim('Session activity is logged to')} ${c.primary('~/.agc/sessions/')}\n`;

export function chatCommand(): Command {
  return new Command('chat')
    .description('Start an interactive chat REPL with an agent')
    .option('--agent <agentId>', 'Agent ID (or set defaultAgentId in config)')
    .option('--resume <sessionId>', 'Resume an existing session by ID')
    .option('--no-stream', 'Disable token streaming (wait for full response)')
    .option('--no-local', 'Disable local file system access for the agent')
    .action(async (opts) => {
      const localEnabled = opts.local !== false;
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
      const initiator = cfg.initiator ?? '';

      if (!isResume) {
        // Create a fresh session
        const spinner = spin('Creating session…');
        try {
          const res = await client.sessions.create({
            agentId,
            initiator,
            title: `agc chat ${new Date().toISOString().slice(0, 16)}`,
            source: 'cli',
          });
          const session = (res as any)?.data ?? res;
          sessionId = session.sessionId;
          spinner.stop();

          // Write session header to local log
          appendSessionLog(sessionId, {
            type: 'session_start',
            sessionId,
            agentId,
            initiator,
            source: 'cli',
            createdAt: new Date().toISOString(),
          });
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
      if (localEnabled) headerRows.push(['Local tools', c.success('enabled') + c.dim('  (read, write, search, run)')]);
      detail(headerRows);

      // ── Local tools setup ────────────────────────────────────────────────────
      let localToolsCfg: LocalToolsConfig | null = null;
      if (localEnabled) {
        console.log(LOCAL_TOOLS_DISCLAIMER);
        const rootDir = process.cwd();
        localToolsCfg = {
          rootDir,
          sessionId,
          appendLog: (record) => appendSessionLog(sessionId, record),
          permissions: new Map(),
        };
        appendSessionLog(sessionId, {
          type: 'local_tools_enabled',
          rootDir,
          timestamp: new Date().toISOString(),
        });
      }

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

        if (input === '/tools') {
          if (!localToolsCfg) {
            console.log(c.dim(`  Local tools are disabled. Remove ${c.bold('--no-local')} flag to re-enable them.`));
          } else {
            console.log(`\n  ${c.bold('Local tools')} ${c.success('enabled')}`);
            console.log(`  ${c.dim('Root directory:')} ${c.primary(localToolsCfg.rootDir)}`);
            const perms = [...localToolsCfg.permissions.entries()];
            if (perms.length) {
              console.log(`  ${c.dim('Cached permissions:')}`);
              for (const [k, v] of perms) {
                const badge = v === 'allow' ? c.success('allow') : c.error('deny');
                console.log(`    ${sym.bullet} ${k}: ${badge}`);
              }
            }
          }
          console.log();
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

        // Log user message to local session file
        appendSessionLog(sessionId, {
          type: 'message',
          role: 'user',
          content: input,
          timestamp: new Date().toISOString(),
        });

        // ── Build per-turn local context ─────────────────────────────────────
        let userMessage = input;
        let cliContext: string | undefined;

        if (localToolsCfg) {
          const rootDir = localToolsCfg.rootDir;

          // Resolve @filepath references in the user's message.
          // e.g. "review @src/index.ts" → reads file and injects its content.
          const atRefs = [...input.matchAll(/@([\S]+)/g)].map(m => m[1]);
          const fileContextBlocks: string[] = [];
          for (const ref of atRefs) {
            const content = readFileForContext(rootDir, ref);
            fileContextBlocks.push(`**${ref}**\n\`\`\`\n${content}\n\`\`\``);
          }

          // Fresh directory snapshot on every turn so the agent sees current state.
          const snapshot = buildDirSnapshot(rootDir, 2);
          cliContext = buildLocalToolsManifest(rootDir, snapshot, fileContextBlocks);
        }

        const params = {
          agentId,
          sessionId,
          messages: [{ role: 'user' as const, content: userMessage }],
          ...(cliContext && { cliContext }),
        };

        process.stdout.write(c.primary('agent') + c.dim(' › '));

        if (opts.noStream) {
          const spinner = spin('');
          try {
            const result = await client.run.once(params);
            spinner.stop();
            const text = extractText(result);
            console.log(text);
            appendSessionLog(sessionId, {
              type: 'message',
              role: 'assistant',
              content: text,
              timestamp: new Date().toISOString(),
            });
          } catch (err) {
            spinner.stop();
            console.error(`\n${sym.fail} ${c.error((err as Error).message ?? String(err))}`);
          }
        } else {
          try {
            let hasOutput = false;
            let agentContent = '';
            for await (const event of client.agents.stream(params)) {
              if (event.type === 'token') {
                const tok = (event as any).content ?? '';
                process.stdout.write(tok);
                agentContent += tok;
                hasOutput = true;
              } else if (event.type === 'cli_tool_request' && localToolsCfg) {
                // ── Local tool execution ──────────────────────────────────────
                // The backend registered cli_* tools that, when called by the
                // LLM, emit this event. We execute locally and POST the result
                // back so the LangGraph run can continue.
                const { requestId, tool: toolName, args } = event as any;
                const displayName = String(toolName).replace('cli_', '');
                if (hasOutput) { process.stdout.write('\n'); hasOutput = false; }
                process.stdout.write(c.dim(`  [local] ${displayName}…`));

                let result: string;
                try {
                  // Map cli_* names back to the local-tools dispatcher names
                  const localToolName = String(toolName).replace('cli_', '');
                  result = await runLocalTool({ tool: localToolName, args: args ?? {} }, localToolsCfg);
                  process.stdout.write(c.dim(' ✓\n'));
                } catch (err: any) {
                  result = `Error: ${err?.message ?? String(err)}`;
                  process.stdout.write(c.dim(' ✗\n'));
                }

                appendSessionLog(sessionId, {
                  type: 'local_tool_result',
                  tool: toolName,
                  result: result.slice(0, 4000),
                  timestamp: new Date().toISOString(),
                });

                // POST result back to backend so the waiting tool node resolves
                try {
                  await fetch(`${cfg.apiUrl}/v1/agents/cli-tool-result`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${cfg.apiKey}`,
                    },
                    body: JSON.stringify({ requestId, result }),
                  });
                } catch (postErr: any) {
                  console.error(c.warn(`\n  [local] Failed to submit tool result: ${postErr?.message}`));
                }
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
                if (text && !hasOutput) {
                  process.stdout.write(text);
                  agentContent += text;
                }
                // ── Cost/usage footer ──────────────────────────────────────
                const usage = e?.payload?.usage;
                if (usage) {
                  const inputTok  = usage.inputTokens ?? 0;
                  const outputTok = usage.outputTokens ?? 0;
                  const cachedTok = usage.cachedTokens ?? 0;
                  const total     = usage.totalTokens ?? (inputTok + outputTok);
                  const cost      = typeof usage.costUsd === 'number' ? `$${usage.costUsd.toFixed(4)}` : '';
                  const parts     = [total ? `${total.toLocaleString()} tokens` : '', cost].filter(Boolean);
                  if (parts.length) process.stdout.write('\n' + c.dim(`  ↳ ${parts.join(' · ')}`));
                  if (cachedTok > 0) process.stdout.write(c.dim(` (${cachedTok.toLocaleString()} cached)`));
                  appendSessionLog(sessionId, {
                    type: 'message',
                    role: 'assistant',
                    content: agentContent,
                    usage: { inputTokens: inputTok, outputTokens: outputTok, cachedTokens: cachedTok, totalTokens: total, costUsd: usage.costUsd },
                    timestamp: new Date().toISOString(),
                  });
                } else {
                  appendSessionLog(sessionId, {
                    type: 'message',
                    role: 'assistant',
                    content: agentContent,
                    timestamp: new Date().toISOString(),
                  });
                }
                break;
              } else if (event.type === 'error') {
                if (hasOutput) process.stdout.write('\n');
                console.error(`\n${sym.fail} ${c.error((event as any).message ?? 'Stream error')}`);
                break;
              }
            }
            process.stdout.write('\n');

            // ── Local tool-call loop (recursive until no more tool calls) ───
            if (localToolsCfg && agentContent) {
              await handleLocalToolLoop(agentContent, localToolsCfg, client, agentId, sessionId, appendSessionLog);
            }
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

/**
 * After each agent response, check whether it contains a local tool call block.
 * If so, execute it, feed the result back, and recurse — handling chained tool
 * calls the same way Claude Code handles sequential tool use in one turn.
 *
 * MAX_TOOL_DEPTH guards against infinite loops (e.g. a confused agent that
 * keeps calling tools without making progress).
 */
const MAX_TOOL_DEPTH = 10;

async function handleLocalToolLoop(
  agentText: string,
  cfg: LocalToolsConfig,
  client: any,
  agentId: string,
  sessionId: string,
  appendLog: (sessionId: string, record: Record<string, unknown>) => void,
  depth = 0,
): Promise<void> {
  if (depth >= MAX_TOOL_DEPTH) {
    console.log(c.dim(`\n  [local] Max tool depth reached (${MAX_TOOL_DEPTH}). Stopping tool loop.\n`));
    return;
  }

  const toolCall = extractToolCall(agentText);
  if (!toolCall) return;

  process.stdout.write(c.dim(`\n  [local] ${toolCall.tool}`));

  let result: string;
  try {
    result = await runLocalTool(toolCall, cfg);
    process.stdout.write(c.dim(' ✓\n'));
  } catch (err: any) {
    result = `Error: ${err?.message ?? String(err)}`;
    process.stdout.write(c.dim(' ✗\n'));
  }

  const resultMsg = `[Tool result: ${toolCall.tool}]\n\`\`\`\n${result}\n\`\`\``;

  appendLog(sessionId, {
    type: 'message',
    role: 'tool',
    tool: toolCall.tool,
    result: result.slice(0, 4000),
    timestamp: new Date().toISOString(),
  });

  // Stream the agent's follow-up response
  process.stdout.write(c.primary('agent') + c.dim(' › '));
  let followContent = '';

  try {
    for await (const evt of client.agents.stream({
      agentId,
      sessionId,
      messages: [{ role: 'user' as const, content: resultMsg }],
    })) {
      if (evt.type === 'token') {
        const tok = (evt as any).content ?? '';
        process.stdout.write(tok);
        followContent += tok;
      } else if (evt.type === 'toolStart') {
        const name = (evt as any).toolName ?? '';
        if (followContent) process.stdout.write('\n');
        process.stdout.write(c.dim(`  [tool] ${name}…`));
      } else if (evt.type === 'toolEnd') {
        process.stdout.write(c.dim(' done\n'));
        process.stdout.write(c.primary('agent') + c.dim(' › '));
      } else if (evt.type === 'final') {
        const txt = extractText((evt as any)?.payload);
        if (txt && !followContent) { process.stdout.write(txt); followContent += txt; }
        appendLog(sessionId, { type: 'message', role: 'assistant', content: followContent, timestamp: new Date().toISOString() });
        break;
      } else if (evt.type === 'error') {
        console.error(`\n${sym.fail} ${c.error((evt as any).message ?? 'Stream error')}`);
        break;
      }
    }
    process.stdout.write('\n');
  } catch (err: any) {
    process.stdout.write('\n');
    console.error(`${sym.fail} ${c.error(err?.message ?? String(err))}`);
    return;
  }

  // Recurse — the follow-up response may itself contain another tool call
  await handleLocalToolLoop(followContent, cfg, client, agentId, sessionId, appendLog, depth + 1);
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
