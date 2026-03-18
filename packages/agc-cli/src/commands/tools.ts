import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, spin, printError, jsonOut } from '../ui.js';

export function toolsCommand(): Command {
  const cmd = new Command('tools').description('Discover and manage tools');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List available tools')
    .option('--owner <id>', 'Filter by owner ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const spinner = spin('Fetching tools…');
      try {
        const client = makeClient();
        const filter = opts.owner ? { owner: opts.owner } : {};
        const res = await client.tools.list(filter as any);
        const tools = (res as any)?.data ?? res ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(tools);
        section(`Tools (${tools.length})`);
        table(
          tools.map((t: any) => ({
            ID:          (t.toolId ?? '').slice(0, 8) + '…',
            Name:        t.name ?? '',
            Description: (t.description ?? '').slice(0, 50),
            Tags:        (t.tags ?? []).join(', '),
          })),
          ['ID', 'Name', 'Description', 'Tags'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <toolId>')
    .description('Show tool details and schema')
    .option('--json', 'Output as JSON')
    .action(async (toolId: string, opts) => {
      const spinner = spin('Fetching tool…');
      try {
        const client = makeClient();
        const res = await client.tools.list({ toolId } as any);
        const tools = (res as any)?.data ?? res ?? [];
        const tool = tools.find((t: any) => t.toolId === toolId || t.name === toolId);
        spinner.stop();
        if (!tool) {
          console.error(c.error(`Tool "${toolId}" not found.`));
          process.exit(1);
        }
        if (opts.json) return jsonOut(tool);
        section(tool.name);
        detail([
          ['Tool ID',     c.id(tool.toolId)],
          ['Description', tool.description ?? c.dim('(none)')],
          ['Tags',        (tool.tags ?? []).join(', ') || c.dim('(none)')],
          ['Public',      tool.isPublic ? 'yes' : 'no'],
          ['Created',     relativeTime(tool.createdAt)],
        ]);
        if (tool.schema) {
          console.log('\n  ' + c.label('Schema'));
          console.log('  ' + JSON.stringify(tool.schema, null, 2).split('\n').join('\n  '));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── exec ─────────────────────────────────────────────────────────────────────
  cmd
    .command('exec <toolName>')
    .description('Execute a tool directly by name')
    .option('--agent <agentId>', 'Agent context for tool execution')
    .option('--args <json>', 'Tool arguments as JSON object', '{}')
    .option('--json', 'Output result as JSON')
    .action(async (toolName: string, opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      let args: Record<string, any> = {};
      try { args = JSON.parse(opts.args); } catch { console.error(c.error('--args must be valid JSON')); process.exit(1); }

      // Build a single-tool prompt that the agent will execute
      const prompt = `Call the tool "${toolName}" with these arguments: ${JSON.stringify(args)}. Return only the tool result, nothing else.`;
      const spinner = spin(`Executing ${toolName}…`);
      try {
        const client = makeClient();
        // Use the run endpoint (non-streaming) — the agent will invoke the named tool
        const result = await client.run.once({
          agentId,
          messages: [{ role: 'user', content: prompt }],
          ...(cfg.initiator && { initiatorId: cfg.initiator }),
        });
        spinner.stop();
        if (opts.json) return jsonOut(result);
        console.log(`\n${sym.ok} ${c.label(toolName)}`);
        const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result, null, 2);
        console.log(text);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
