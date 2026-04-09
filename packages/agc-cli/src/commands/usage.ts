import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, spin, printError, jsonOut } from '../ui.js';

export function usageCommand(): Command {
  const cmd = new Command('usage').description('View token usage and cost by agent');

  cmd
    .command('agents')
    .description('Show usage summary for all your agents')
    .option('--owner <address>', 'Owner address (defaults to configured initiator)')
    .option('--from <date>', 'Start date (ISO, e.g. 2025-01-01)')
    .option('--to <date>',   'End date (ISO)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const owner = opts.owner ?? cfg.initiator;
      if (!owner) {
        console.error(c.error('Specify --owner or run `agc login` first'));
        process.exit(1);
      }
      const spinner = spin('Fetching agents…');
      try {
        const client = makeClient();
        // Fetch all agents for this owner, then get usage for each
        const agentsRes = await client.agents.list(owner);
        const agents = (agentsRes as any)?.data ?? [];
        spinner.stop();
        if (agents.length === 0) {
          console.log(c.dim('No agents found'));
          return;
        }

        spin('Fetching usage…');
        const rows = await Promise.allSettled(
          agents.map((a: any) =>
            client.usage.getAgentUsage(a.agentId, {
              from: opts.from,
              to: opts.to,
            }).then((r: any) => ({
              agentId: a.agentId,
              name: a.name || a.agentId.slice(0, 12),
              ...(r?.data ?? r ?? {}),
            }))
          )
        );

        const data = rows
          .filter((r) => r.status === 'fulfilled')
          .map((r) => (r as PromiseFulfilledResult<any>).value);

        if (opts.json) return jsonOut(data);

        let totalTokens = 0, totalCost = 0, totalCalls = 0;
        data.forEach((r) => {
          totalTokens += r.totalTokens ?? 0;
          totalCost += r.totalCostUsd ?? 0;
          totalCalls += r.callCount ?? 0;
        });

        section('Usage Summary');
        detail([
          ['Total tokens', totalTokens.toLocaleString()],
          ['Total cost',   `$${totalCost.toFixed(4)} USD`],
          ['LLM calls',    totalCalls.toLocaleString()],
        ]);

        const active = data.filter((r) => (r.totalTokens ?? 0) > 0);
        if (active.length) {
          console.log('');
          table(
            active
              .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
              .map((r) => ({
                Agent:   r.name,
                Calls:   (r.callCount ?? 0).toLocaleString(),
                Tokens:  (r.totalTokens ?? 0).toLocaleString(),
                'Cost $': (r.totalCostUsd ?? 0).toFixed(4),
              })),
            ['Agent', 'Calls', 'Tokens', 'Cost $'],
          );
        }
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('agent <agentId>')
    .description('Show detailed usage for a specific agent')
    .option('--from <date>', 'Start date (ISO)')
    .option('--to <date>',   'End date (ISO)')
    .option('--json', 'Output as JSON')
    .action(async (agentId: string, opts) => {
      const spinner = spin('Fetching usage…');
      try {
        const client = makeClient();
        const res = await client.usage.getAgentUsage(agentId, {
          from: opts.from,
          to: opts.to,
        });
        const data = (res as any)?.data ?? res;
        spinner.stop();
        if (opts.json) return jsonOut(data);
        section(`Usage — ${agentId.slice(0, 12)}…`);
        detail([
          ['Calls',         (data.callCount ?? 0).toLocaleString()],
          ['Input tokens',  (data.totalInputTokens ?? 0).toLocaleString()],
          ['Output tokens', (data.totalOutputTokens ?? 0).toLocaleString()],
          ['Total tokens',  (data.totalTokens ?? 0).toLocaleString()],
          ['Cost',          `$${(data.totalCostUsd ?? 0).toFixed(6)} USD`],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
