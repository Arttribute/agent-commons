import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, relativeTime, spin, printError, jsonOut, openBrowser } from '../ui.js';

export function connectionsCommand(): Command {
  const cmd = new Command('connections').description(
    'Manage OAuth account connections (Google Workspace, GitHub, Slack, …) that agents act with',
  );

  // ── list ────────────────────────────────────────────────────────────────────
  cmd
    .command('list', { isDefault: true })
    .description('List your connected accounts')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const spinner = spin('Fetching connections…');
      try {
        const client = makeClient();
        const res = await client.oauth.listConnections(
          cfg.initiator ? { ownerId: cfg.initiator, ownerType: 'user' } : undefined,
        );
        const connections = (res as any)?.connections ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(connections);
        section(`Connections (${connections.length})`);
        if (connections.length === 0) {
          console.log(c.dim('  No connected accounts. Run `agc connections connect <provider>`.'));
          return;
        }
        table(
          connections.map((conn: any) => ({
            ID:       (conn.connectionId ?? '').slice(0, 8) + '…',
            Provider: conn.providerDisplayName || conn.providerKey || '',
            Account:  conn.providerUserEmail || conn.providerUserName || '',
            Status:   conn.status ?? '',
            Scopes:   String((conn.scopes ?? []).length),
            Used:     conn.lastUsedAt ? relativeTime(conn.lastUsedAt) : c.dim('never'),
          })),
          ['ID', 'Provider', 'Account', 'Status', 'Scopes', 'Used'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── providers ───────────────────────────────────────────────────────────────
  cmd
    .command('providers')
    .description('List OAuth providers available to connect')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = spin('Fetching providers…');
      try {
        const client = makeClient();
        const res = await client.oauth.listProviders();
        const providers = (res as any)?.providers ?? [];
        spinner.stop();
        if (opts.json) return jsonOut(providers);
        section(`Providers (${providers.length})`);
        table(
          providers.map((p: any) => ({
            Key:    p.providerKey ?? '',
            Name:   p.displayName ?? '',
            Active: p.isActive ? 'yes' : 'no',
          })),
          ['Key', 'Name', 'Active'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── connect ─────────────────────────────────────────────────────────────────
  cmd
    .command('connect <providerKey>')
    .description('Connect an account: prints an authorization URL to open in your browser')
    .option('--scopes <scopes>', 'Space-separated OAuth scopes to request')
    .option('--no-browser', 'Do not open the authorization URL automatically')
    .option('--json', 'Output as JSON')
    .action(async (providerKey: string, opts) => {
      const cfg = loadConfig();
      if (!cfg.initiator) {
        console.error(c.error('No initiator set. Run `agc login` first.'));
        process.exit(1);
      }
      const spinner = spin('Starting OAuth flow…');
      try {
        const client = makeClient();
        const res = await client.oauth.connect({
          providerKey,
          ...(opts.scopes ? { scopes: String(opts.scopes).split(/\s+/).filter(Boolean) } : {}),
        });
        spinner.stop();
        if (opts.json) return jsonOut(res);
        if (opts.browser !== false) openBrowser(res.authorizationUrl);
        console.log(`\n${sym.ok} Authorize the connection in your browser:`);
        console.log(`\n  ${c.id(res.authorizationUrl)}\n`);
        console.log(c.dim('  After approving, the connection appears in `agc connections list`.'));
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('get <connectionId>')
    .description('Show a connected account')
    .option('--json', 'Output as JSON')
    .action(async (connectionId: string, opts) => {
      const spinner = spin('Fetching connection…');
      try {
        const result = await makeClient().oauth.getConnection(connectionId);
        spinner.stop();
        if (opts.json) return jsonOut(result.connection);
        const connection = result.connection;
        detail([
          ['Connection ID', c.id(connection.connectionId)],
          ['Provider', connection.providerDisplayName ?? connection.providerKey],
          ['Account', connection.providerUserEmail ?? connection.providerUserName ?? ''],
          ['Status', connection.status],
          ['Scopes', connection.scopes.join(', ')],
          [
            'Expires',
            connection.accessTokenExpiresAt ??
              connection.expiresAt ??
              c.dim('(does not expire)'),
          ],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('refresh <connectionId>')
    .description('Refresh a connected account token')
    .action(async (connectionId: string) => {
      const spinner = spin('Refreshing connection…');
      try {
        await makeClient().oauth.refresh(connectionId);
        spinner.stop();
        console.log(`${sym.ok} Connection refreshed.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('rename <connectionId> <name>')
    .description('Set a friendly name for a connected account')
    .action(async (connectionId: string, name: string) => {
      const spinner = spin('Updating connection…');
      try {
        await makeClient().oauth.updateConnection(connectionId, {
          displayName: name,
        });
        spinner.stop();
        console.log(`${sym.ok} Connection renamed to ${c.bold(name)}.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── test ────────────────────────────────────────────────────────────────────
  cmd
    .command('test <connectionId>')
    .description('Check that a connection is active and its token is valid')
    .option('--json', 'Output as JSON')
    .action(async (connectionId: string, opts) => {
      const spinner = spin('Testing connection…');
      try {
        const client = makeClient();
        const res = await client.oauth.test(connectionId);
        spinner.stop();
        if (opts.json) return jsonOut(res);
        detail([
          ['Status',      res.status],
          ['Token valid', res.accessTokenValid ? 'yes' : 'no'],
          ['Account',     res.providerUserEmail ?? c.dim('(unknown)')],
          ['Last error',  res.error ?? c.dim('(none)')],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── revoke ──────────────────────────────────────────────────────────────────
  cmd
    .command('revoke <connectionId>')
    .description('Revoke a connection and delete its stored tokens')
    .action(async (connectionId: string) => {
      const spinner = spin('Revoking connection…');
      try {
        const client = makeClient();
        await client.oauth.revoke(connectionId);
        spinner.stop();
        console.log(`${sym.ok} Connection revoked.`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}
