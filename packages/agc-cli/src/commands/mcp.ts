import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, spin, printError, jsonOut } from '../ui.js';

export function mcpCommand(): Command {
  const cmd = new Command('mcp').description('Manage MCP (Model Context Protocol) servers');

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List MCP servers for the current initiator')
    .option('--agent <agentId>', 'List servers owned by an agent instead of the user')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator && !opts.agent) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const ownerId = opts.agent ?? cfg.initiator!;
      const ownerType: 'user' | 'agent' = opts.agent ? 'agent' : 'user';
      const spinner = spin('Fetching MCP servers…');
      try {
        const client = makeClient();
        const res = await client.mcp.listServers(ownerId, ownerType);
        const servers = res.servers ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(servers);
        section(`MCP Servers (${servers.length})`);
        if (!servers.length) {
          console.log(c.dim('  No MCP servers configured.'));
          console.log(c.dim('  Add one with: agc mcp add --name "filesystem" --type stdio --command "npx @mcp/server-filesystem ~/projects"'));
          return;
        }
        table(
          servers.map((s: any) => ({
            ID:      (s.serverId ?? '').slice(0, 8) + '…',
            Name:    s.name ?? '',
            Type:    s.connectionType ?? '',
            Tools:   String(s.toolCount ?? 0),
            Created: relativeTime(s.createdAt),
          })),
          ['ID', 'Name', 'Type', 'Tools', 'Created'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── get ─────────────────────────────────────────────────────────────────────
  cmd
    .command('get <serverId>')
    .description('Show details for an MCP server')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, opts) => {
      const spinner = spin('Fetching server…');
      try {
        const client = makeClient();
        const server = await client.mcp.getServer(serverId);
        spinner.stop();
        if (opts.json) return jsonOut(server);
        section((server as any).name ?? serverId);
        detail([
          ['Server ID',   c.id((server as any).serverId)],
          ['Type',        (server as any).connectionType ?? c.dim('(unknown)')],
          ['Tools',       String((server as any).toolCount ?? 0)],
          ['Public',      (server as any).isPublic ? 'yes' : 'no'],
          ['Created',     relativeTime((server as any).createdAt)],
        ]);
        const cfg = (server as any).connectionConfig;
        if (cfg) {
          console.log('\n  ' + c.label('Connection Config'));
          // Redact sensitive fields
          const safe = { ...cfg, apiKey: cfg.apiKey ? '****' : undefined, token: cfg.token ? '****' : undefined };
          console.log('  ' + JSON.stringify(safe, null, 2).split('\n').join('\n  '));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── add ──────────────────────────────────────────────────────────────────────
  cmd
    .command('add')
    .description('Register a new MCP server')
    .requiredOption('--name <name>', 'Server name')
    .requiredOption('--type <type>', 'Connection type: stdio | sse | http | streamable-http')
    .option('--command <cmd>', 'Command to run (for stdio type, e.g. "npx @mcp/server-filesystem ~/projects")')
    .option('--url <url>', 'Server URL (for sse/http types)')
    .option('--agent <agentId>', 'Assign to an agent instead of the current user')
    .option('--public', 'Make server publicly visible')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator && !opts.agent) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }

      const validTypes = ['stdio', 'sse', 'http', 'streamable-http'];
      if (!validTypes.includes(opts.type)) {
        console.error(c.error(`Invalid type "${opts.type}". Choose from: ${validTypes.join(', ')}`));
        process.exit(1);
      }

      if (opts.type === 'stdio' && !opts.command) {
        console.error(c.error('--command is required for stdio type'));
        process.exit(1);
      }
      if ((opts.type === 'sse' || opts.type === 'http' || opts.type === 'streamable-http') && !opts.url) {
        console.error(c.error('--url is required for sse/http/streamable-http types'));
        process.exit(1);
      }

      const connectionConfig: Record<string, string> = {};
      if (opts.command) connectionConfig.command = opts.command;
      if (opts.url) connectionConfig.url = opts.url;

      const ownerId = opts.agent ?? cfg.initiator!;
      const ownerType: 'user' | 'agent' = opts.agent ? 'agent' : 'user';

      const spinner = spin('Registering MCP server…');
      try {
        const client = makeClient();
        const server = await client.mcp.createServer({
          name: opts.name,
          connectionType: opts.type as any,
          connectionConfig,
          isPublic: !!opts.public,
          ownerId,
          ownerType,
        });
        spinner.stop();
        if (opts.json) return jsonOut(server);
        console.log(`\n${sym.ok} MCP server registered`);
        detail([
          ['Server ID', c.id((server as any).serverId)],
          ['Name',      (server as any).name],
          ['Type',      (server as any).connectionType],
        ]);
        console.log(c.dim(`\n  Connect and sync tools with: agc mcp sync ${(server as any).serverId}`));
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── connect ──────────────────────────────────────────────────────────────────
  cmd
    .command('connect <serverId>')
    .description('Connect to an MCP server')
    .action(async (serverId: string) => {
      const spinner = spin('Connecting…');
      try {
        const client = makeClient();
        const res = await client.mcp.connect(serverId);
        spinner.stop();
        if ((res as any).connected) {
          console.log(`${sym.ok} Connected to ${c.id(serverId)}`);
          console.log(c.dim(`  Run \`agc mcp sync ${serverId}\` to discover tools.`));
        } else {
          console.log(c.warn('Connection returned but reported not connected.'));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── disconnect ───────────────────────────────────────────────────────────────
  cmd
    .command('disconnect <serverId>')
    .description('Disconnect from an MCP server')
    .action(async (serverId: string) => {
      const spinner = spin('Disconnecting…');
      try {
        const client = makeClient();
        await client.mcp.disconnect(serverId);
        spinner.stop();
        console.log(`${sym.ok} Disconnected from ${c.id(serverId)}`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── sync ─────────────────────────────────────────────────────────────────────
  cmd
    .command('sync <serverId>')
    .description('Sync tools, resources, and prompts from an MCP server')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, opts) => {
      const spinner = spin('Syncing…');
      try {
        const client = makeClient();
        const res = await client.mcp.sync(serverId);
        spinner.stop();
        if (opts.json) return jsonOut(res);
        console.log(`${sym.ok} Sync complete`);
        detail([
          ['Tools discovered',     String(res.toolsDiscovered)],
          ['Resources discovered', String(res.resourcesDiscovered)],
          ['Prompts discovered',   String(res.promptsDiscovered)],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── tools ────────────────────────────────────────────────────────────────────
  cmd
    .command('tools <serverId>')
    .description('List tools discovered from an MCP server')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, opts) => {
      const spinner = spin('Fetching tools…');
      try {
        const client = makeClient();
        const res = await client.mcp.listTools(serverId);
        const tools = res.tools ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(tools);
        section(`MCP Tools (${res.total ?? tools.length})`);
        table(
          tools.map((t: any) => ({
            Name:        t.name ?? '',
            Description: (t.description ?? '').slice(0, 60),
          })),
          ['Name', 'Description'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── resources ────────────────────────────────────────────────────────────────
  cmd
    .command('resources <serverId>')
    .description('List resources from an MCP server')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, opts) => {
      const spinner = spin('Fetching resources…');
      try {
        const client = makeClient();
        const res = await client.mcp.listResources(serverId);
        const resources = res.resources ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(resources);
        section(`MCP Resources (${res.total ?? resources.length})`);
        table(
          resources.map((r: any) => ({
            URI:         r.uri ?? '',
            Name:        r.name ?? '',
            MimeType:    r.mimeType ?? c.dim('(none)'),
          })),
          ['URI', 'Name', 'MimeType'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── read ─────────────────────────────────────────────────────────────────────
  cmd
    .command('read <serverId> <uri>')
    .description('Read a resource from an MCP server by URI')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, uri: string, opts) => {
      const spinner = spin('Reading resource…');
      try {
        const client = makeClient();
        const res = await client.mcp.readResource(serverId, uri);
        spinner.stop();
        if (opts.json) return jsonOut(res);
        section(`Resource: ${uri}`);
        const contents = res.contents;
        if (typeof contents === 'string') {
          console.log(contents);
        } else {
          console.log(JSON.stringify(contents, null, 2));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── prompts ──────────────────────────────────────────────────────────────────
  cmd
    .command('prompts <serverId>')
    .description('List prompts from an MCP server')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, opts) => {
      const spinner = spin('Fetching prompts…');
      try {
        const client = makeClient();
        const res = await client.mcp.listPrompts(serverId);
        const prompts = res.prompts ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(prompts);
        section(`MCP Prompts (${res.total ?? prompts.length})`);
        table(
          prompts.map((p: any) => ({
            Name:        p.name ?? '',
            Description: (p.description ?? '').slice(0, 60),
          })),
          ['Name', 'Description'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── prompt ───────────────────────────────────────────────────────────────────
  cmd
    .command('prompt <serverId> <promptName>')
    .description('Render an MCP prompt with optional arguments')
    .option('--args <json>', 'Prompt arguments as JSON object', '{}')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, promptName: string, opts) => {
      let args: Record<string, string> = {};
      try { args = JSON.parse(opts.args); } catch { console.error(c.error('--args must be valid JSON')); process.exit(1); }
      const spinner = spin('Rendering prompt…');
      try {
        const client = makeClient();
        const res = await client.mcp.getPrompt(serverId, promptName, args);
        spinner.stop();
        if (opts.json) return jsonOut(res);
        if (res.description) console.log(c.dim(res.description) + '\n');
        for (const msg of res.messages ?? []) {
          const role = c.label(msg.role ?? 'unknown');
          const text = typeof msg.content === 'string'
            ? msg.content
            : (msg.content as any)?.text ?? JSON.stringify(msg.content);
          console.log(`${role}: ${text}\n`);
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── remove ───────────────────────────────────────────────────────────────────
  cmd
    .command('remove <serverId>')
    .description('Delete an MCP server')
    .action(async (serverId: string) => {
      const spinner = spin('Removing server…');
      try {
        const client = makeClient();
        await client.mcp.deleteServer(serverId);
        spinner.stop();
        console.log(`${sym.ok} MCP server ${c.id(serverId)} removed.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
