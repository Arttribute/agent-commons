import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, spin, printError, jsonOut } from '../ui.js';

export function sessionsCommand(): Command {
  const cmd = new Command('sessions').description('Manage chat sessions');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List sessions for the current initiator + agent')
    .option('--agent <agentId>', 'Filter by agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      const spinner = spin('Fetching sessions…');
      try {
        const client = makeClient();
        const res = await client.sessions.list(agentId, cfg.initiator);
        const sessions = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(sessions);
        section(`Sessions (${sessions.length})`);
        table(
          sessions.map((s: any) => ({
            ID:      s.sessionId.slice(0, 8) + '…',
            Title:   s.title ?? c.dim('(untitled)'),
            Model:   s.model?.modelId ?? s.model?.name ?? '',
            Created: relativeTime(s.createdAt),
          })),
          ['ID', 'Title', 'Model', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <sessionId>')
    .description('Show session details')
    .option('--json', 'Output as JSON')
    .action(async (sessionId: string, opts) => {
      const spinner = spin('Fetching session…');
      try {
        const client = makeClient();
        const res = await client.sessions.get(sessionId);
        const session = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(session);
        section('Session');
        detail([
          ['Session ID', c.id(session.sessionId)],
          ['Title',      session.title ?? c.dim('(untitled)')],
          ['Agent ID',   session.agentId],
          ['Model',      session.model?.modelId ?? session.model?.name ?? ''],
          ['Initiator',  session.initiator ?? ''],
          ['Created',    relativeTime(session.createdAt)],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── create ──────────────────────────────────────────────────────────────────
  cmd
    .command('create')
    .description('Create a new session')
    .option('--agent <agentId>', 'Agent ID')
    .option('--title <title>', 'Session title')
    .option('--model <id>', 'Model ID (e.g. gpt-4o, claude-sonnet-4-6)')
    .option('--provider <provider>', 'Model provider')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId'));
        process.exit(1);
      }
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const spinner = spin('Creating session…');
      try {
        const client = makeClient();
        const res = await client.sessions.create({
          agentId,
          initiator: cfg.initiator,
          title: opts.title,
          ...(opts.model && { model: { modelId: opts.model, provider: opts.provider } }),
        });
        const session = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(session);
        console.log(`\n${sym.ok} Session created`);
        detail([
          ['Session ID', c.id(session.sessionId)],
          ['Title',      session.title ?? c.dim('(untitled)')],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
