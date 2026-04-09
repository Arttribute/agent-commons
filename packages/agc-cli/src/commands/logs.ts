import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, section, spin, printError, jsonOut, relativeTime } from '../ui.js';

const STATUS_COLOR: Record<string, (s: string) => string> = {
  success: (s) => c.bold(s),
  error:   (s) => c.error(s),
  warning: (s) => c.warn(s),
};

function colorStatus(status: string): string {
  return (STATUS_COLOR[status] ?? c.dim)(status);
}

export function logsCommand(): Command {
  const cmd = new Command('logs').description('View agent activity logs');

  cmd
    .command('list')
    .alias('ls')
    .description('List recent log entries for an agent')
    .option('--agent <agentId>', 'Agent ID (defaults to configured agent)')
    .option('--session <sessionId>', 'Filter by session ID')
    .option('--status <status>', 'Filter: success | error | warning')
    .option('--limit <n>', 'Max entries to show', '50')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId'));
        process.exit(1);
      }
      const spinner = spin('Fetching logs…');
      try {
        const client = makeClient();
        // Fetch via the backend URL directly through the base client request
        const qs = new URLSearchParams({ limit: opts.limit });
        if (opts.session) qs.set('sessionId', opts.session);
        const res = await (client as any).request('GET', `/v1/logs/agents/${agentId}?${qs}`);
        let logs: any[] = (res as any)?.data ?? res ?? [];
        if (opts.status) logs = logs.filter((l: any) => l.status === opts.status);
        spinner.stop();
        if (opts.json) return jsonOut(logs);
        section(`Logs — ${agentId.slice(0, 12)}… (${logs.length})`);
        if (logs.length === 0) {
          console.log(c.dim('  No logs yet'));
          return;
        }
        logs.forEach((l: any) => {
          const tools = (l.tools ?? []).length > 0 ? ` ${c.dim(`[${l.tools.length} tools]`)}` : '';
          const rt = l.responseTime > 0 ? c.dim(` ${l.responseTime}ms`) : '';
          console.log(
            `  ${colorStatus((l.status ?? 'info').padEnd(7))}  ${c.bold(l.action ?? '')}${rt}${tools}`
          );
          if (l.message) {
            console.log(`  ${' '.repeat(10)}${c.dim(l.message.slice(0, 80))}`);
          }
          console.log(`  ${' '.repeat(10)}${c.dim(relativeTime(l.timestamp))}`);
          console.log('');
        });
      } catch (err) {
        spin('').stop();
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('errors')
    .description('Show only error log entries for an agent')
    .option('--agent <agentId>', 'Agent ID')
    .option('--limit <n>', 'Max entries', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId>'));
        process.exit(1);
      }
      const spinner = spin('Fetching error logs…');
      try {
        const client = makeClient();
        const res = await (client as any).request('GET', `/v1/logs/agents/${agentId}?limit=${opts.limit}`);
        const errors = ((res as any)?.data ?? []).filter((l: any) => l.status === 'error');
        spinner.stop();
        if (opts.json) return jsonOut(errors);
        section(`Errors — ${agentId.slice(0, 12)}… (${errors.length})`);
        if (errors.length === 0) {
          console.log(`${sym.ok} No errors found`);
          return;
        }
        errors.forEach((l: any) => {
          console.log(`  ${c.error('✖')} ${c.bold(l.action ?? '')}  ${c.dim(relativeTime(l.timestamp))}`);
          if (l.message) console.log(`    ${c.dim(l.message)}`);
          console.log('');
        });
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
