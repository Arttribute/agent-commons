import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, spin, printError, jsonOut, relativeTime } from '../ui.js';

export function memoryCommand(): Command {
  const cmd = new Command('memory').description('View and manage agent memories');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List memories for an agent')
    .option('--agent <agentId>', 'Agent ID (defaults to configured agent)')
    .option('--type <type>', 'Filter by type: episodic | semantic | procedural')
    .option('--limit <n>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId'));
        process.exit(1);
      }
      const spinner = spin('Fetching memories…');
      try {
        const client = makeClient();
        const res = await client.memory.list(agentId, {
          type: opts.type,
          limit: parseInt(opts.limit, 10),
        });
        const memories = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(memories);
        section(`Memories for ${agentId.slice(0, 12)}… (${memories.length})`);
        if (memories.length === 0) {
          console.log(c.dim('  No memories yet'));
          return;
        }
        table(
          memories.map((m: any) => ({
            ID:      m.memoryId?.slice(0, 8) + '…',
            Type:    m.memoryType ?? '',
            Content: (m.content ?? '').slice(0, 60),
            Created: relativeTime(m.createdAt),
          })),
          ['ID', 'Type', 'Content', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── stats ───────────────────────────────────────────────────────────────────
  cmd
    .command('stats')
    .description('Show memory statistics for an agent')
    .option('--agent <agentId>', 'Agent ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId>'));
        process.exit(1);
      }
      const spinner = spin('Fetching stats…');
      try {
        const client = makeClient();
        const res = await client.memory.stats(agentId);
        const stats = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(stats);
        section('Memory Stats');
        detail([
          ['Total',      String(stats.totalCount ?? 0)],
          ['Episodic',   String(stats.episodicCount ?? 0)],
          ['Semantic',   String(stats.semanticCount ?? 0)],
          ['Procedural', String(stats.proceduralCount ?? 0)],
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
    .description('Manually add a memory for an agent')
    .requiredOption('--agent <agentId>', 'Agent ID')
    .requiredOption('--content <text>', 'Memory content')
    .option('--type <type>', 'Memory type: episodic | semantic | procedural', 'semantic')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Creating memory…');
      try {
        const client = makeClient();
        const res = await client.memory.create({
          agentId: opts.agent,
          content: opts.content,
          memoryType: opts.type,
        });
        const memory = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(memory);
        console.log(`\n${sym.ok} Memory created`);
        detail([
          ['ID',      c.id(memory.memoryId)],
          ['Type',    memory.memoryType ?? ''],
          ['Content', memory.content ?? ''],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── delete ──────────────────────────────────────────────────────────────────
  cmd
    .command('delete <memoryId>')
    .description('Delete a memory by ID')
    .option('--json', 'Output as JSON')
    .action(async (memoryId: string, opts) => {
      const spinner = spin('Deleting memory…');
      try {
        const client = makeClient();
        await client.memory.delete(memoryId);
        spinner.stop();
        if (opts.json) return jsonOut({ deleted: true, memoryId });
        console.log(`\n${sym.ok} Memory ${c.id(memoryId)} deleted`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── search ──────────────────────────────────────────────────────────────────
  cmd
    .command('search <query>')
    .description('Semantic search over agent memories')
    .option('--agent <agentId>', 'Agent ID')
    .option('--limit <n>', 'Max results', '10')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId>'));
        process.exit(1);
      }
      const spinner = spin('Searching memories…');
      try {
        const client = makeClient();
        const res = await client.memory.retrieve(agentId, query, parseInt(opts.limit, 10));
        const memories = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(memories);
        section(`Search results (${memories.length})`);
        if (memories.length === 0) {
          console.log(c.dim('  No relevant memories found'));
          return;
        }
        memories.forEach((m: any, i: number) => {
          console.log(`\n  ${c.dim(`${i + 1}.`)} ${m.content ?? ''}`);
          console.log(`     ${c.dim(`type: ${m.memoryType ?? ''} · ${relativeTime(m.createdAt)}`)}`);
        });
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
