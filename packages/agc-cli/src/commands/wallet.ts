import { Command } from 'commander';
import { loadConfig, makeClient } from '../config.js';
import { c, sym, table, detail, section, spin, printError, jsonOut } from '../ui.js';

export function walletCommand(): Command {
  const cmd = new Command('wallet').description('Manage agent wallets');

  // ── list ───────────────────────────────────────────────────────────────────
  cmd
    .command('list')
    .description('List all wallets for an agent')
    .option('--agent <agentId>', 'Agent ID (or use defaultAgentId from config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      const spinner = spin('Fetching wallets…');
      try {
        const client = makeClient();
        const wallets = await client.wallets.list(agentId);
        spinner.stop();
        if (opts.json) return jsonOut(wallets);
        const list = (wallets as any)?.data ?? wallets ?? [];
        section(`Wallets for agent ${agentId.slice(0, 8)}… (${list.length})`);
        table(
          list.map((w: any) => ({
            ID:       w.id.slice(0, 8) + '…',
            Type:     w.walletType,
            Address:  w.address,
            Chain:    chainName(w.chainId),
            Label:    w.label ?? 'Primary',
            Active:   w.isActive ? sym.ok : sym.fail,
          })),
          ['ID', 'Type', 'Address', 'Chain', 'Label', 'Active'],
        );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── show ───────────────────────────────────────────────────────────────────
  cmd
    .command('show')
    .description("Show the agent's primary wallet address")
    .option('--agent <agentId>', 'Agent ID (or use defaultAgentId from config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      const spinner = spin('Fetching primary wallet…');
      try {
        const client = makeClient();
        const wallet = await client.wallets.primary(agentId);
        spinner.stop();
        if (!wallet) {
          console.log(c.warn(`  No wallet found for agent ${agentId}`));
          console.log(c.dim(`  Run: agc wallet create --agent ${agentId}`));
          return;
        }
        const w = (wallet as any)?.data ?? wallet;
        if (opts.json) return jsonOut(w);
        section('Primary Wallet');
        detail([
          ['Address',  w.address],
          ['Type',     w.walletType],
          ['Chain',    chainName(w.chainId)],
          ['Label',    w.label ?? 'Primary'],
          ['Wallet ID', w.id],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── balance ────────────────────────────────────────────────────────────────
  cmd
    .command('balance')
    .description("Show the agent's wallet USDC and ETH balance")
    .option('--agent <agentId>', 'Agent ID (or use defaultAgentId from config)')
    .option('--wallet <walletId>', 'Specific wallet ID (defaults to primary)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      const spinner = spin('Fetching balance…');
      try {
        const client = makeClient();
        let walletId = opts.wallet;
        if (!walletId) {
          const primary = await client.wallets.primary(agentId);
          const w = (primary as any)?.data ?? primary;
          if (!w) {
            spinner.stop();
            console.log(c.warn(`  No wallet found. Run: agc wallet create --agent ${agentId}`));
            return;
          }
          walletId = w.id;
        }
        const balance = await client.wallets.balance(walletId);
        spinner.stop();
        const b = (balance as any)?.data ?? balance;
        if (opts.json) return jsonOut(b);
        section('Wallet Balance');
        detail([
          ['Address', b.address],
          ['Chain',   chainName(b.chainId)],
          ['USDC',    c.bold(b.usdc + ' USDC')],
          ['ETH',     b.native + ' ETH'],
        ]);
        console.log();
        console.log(c.dim('  Fund this wallet by sending USDC to the address above.'));
        console.log(c.dim('  Network: Base Sepolia (chain 84532)'));
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  // ── create ─────────────────────────────────────────────────────────────────
  cmd
    .command('create')
    .description('Create a new wallet for an agent')
    .option('--agent <agentId>', 'Agent ID (or use defaultAgentId from config)')
    .option('--type <type>', 'Wallet type: eoa | external (default: eoa)', 'eoa')
    .option('--label <label>', 'Wallet label (default: Primary)', 'Primary')
    .option('--address <address>', 'For --type external: owner-provided address')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();
      const agentId = opts.agent ?? cfg.defaultAgentId;
      if (!agentId) {
        console.error(c.error('Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`'));
        process.exit(1);
      }
      if (opts.type === 'external' && !opts.address) {
        console.error(c.error('--address is required for --type external'));
        process.exit(1);
      }
      const spinner = spin('Creating wallet…');
      try {
        const client = makeClient();
        const wallet = await client.wallets.create({
          agentId,
          walletType: opts.type,
          label: opts.label,
          externalAddress: opts.address,
        });
        spinner.stop();
        const w = (wallet as any)?.data ?? wallet;
        if (opts.json) return jsonOut(w);
        console.log(`\n${sym.ok} ${c.bold('Wallet created')}`);
        detail([
          ['Address',  c.bold(w.address)],
          ['Type',     w.walletType],
          ['Chain',    chainName(w.chainId)],
          ['Label',    w.label],
          ['Wallet ID', w.id],
        ]);
        console.log();
        console.log(c.dim('  Fund this wallet by sending USDC to the address above.'));
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}

function chainName(chainId: string): string {
  const names: Record<string, string> = {
    '84532': 'Base Sepolia',
    '8453':  'Base',
    '1':     'Ethereum',
    '137':   'Polygon',
  };
  return names[chainId] ?? `chain ${chainId}`;
}
