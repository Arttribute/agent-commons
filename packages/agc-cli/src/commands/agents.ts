import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, spin, printError, jsonOut } from '../ui.js';

export function agentsCommand(): Command {
  const cmd = new Command('agents').description('Manage agents');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List agents owned by the current initiator')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const spinner = spin('Fetching agents…');
      try {
        const client = makeClient();
        const res = await client.agents.list(cfg.initiator);
        const agents = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(agents);
        section(`Agents (${agents.length})`);
        table(
          agents.map((a: any) => ({
            ID:       a.agentId.slice(0, 8) + '…',
            Name:     a.name,
            Model:    `${a.modelProvider}/${a.modelId}`,
            Created:  relativeTime(a.createdAt),
          })),
          ['ID', 'Name', 'Model', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <agentId>')
    .description('Show details for an agent')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, opts) => {
      const spinner = spin('Fetching agent…');
      try {
        const client = makeClient();
        const res = await client.agents.get(agentId);
        const agent = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(agent);
        section(agent.name);
        detail([
          ['Agent ID',    c.id(agent.agentId)],
          ['Provider',    `${agent.modelProvider} / ${agent.modelId}`],
          ['Instructions', agent.instructions?.slice(0, 80) ?? c.dim('(none)')],
          ['Tools',       [...(agent.commonTools ?? []), ...(agent.externalTools ?? [])].join(', ') || c.dim('(none)')],
          ['Created',     relativeTime(agent.createdAt)],
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
    .description('Create a new agent')
    .requiredOption('--name <name>', 'Agent name')
    .option('--instructions <text>', 'System instructions')
    .option('--provider <provider>', 'Model provider (openai|anthropic|google|groq)', 'openai')
    .option('--model <id>', 'Model ID', 'gpt-4o')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const spinner = spin('Creating agent…');
      try {
        const client = makeClient();
        const res = await client.agents.create({
          name: opts.name,
          instructions: opts.instructions,
          owner: cfg.initiator,
          modelProvider: opts.provider as any,
          modelId: opts.model,
        });
        const agent = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(agent);
        console.log(`\n${sym.ok} Agent created`);
        detail([
          ['Agent ID', c.id(agent.agentId)],
          ['Name',     agent.name],
          ['Model',    `${agent.modelProvider}/${agent.modelId}`],
        ]);
        console.log(c.dim('\n  Tip: agc config set defaultAgentId ' + agent.agentId));
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
