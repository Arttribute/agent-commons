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

  cmd
    .command('send')
    .description('Send USDC (or ETH) from an agent wallet to another address')
    .requiredOption('--agent <agentId>', 'Agent ID')
    .requiredOption('--to <address>', 'Recipient address (0x…)')
    .requiredOption('--amount <amount>', 'Amount to send (e.g. 10.5)')
    .option('--token <symbol>', 'Token to send: USDC or ETH (default: USDC)', 'USDC')
    .option('--wallet <walletId>', 'Specific wallet ID (defaults to primary)')
    .action(async (opts) => {
      const client = makeClient();
      const spinner = spin('Preparing transfer…');
      try {
        let walletId = opts.wallet;
        if (!walletId) {
          const primary = await client.wallets.primary(opts.agent);
          const w = (primary as any)?.data ?? primary;
          if (!w?.id) {
            spinner.stop();
            console.error(c.error(`No wallet found for agent ${opts.agent}. Run: agc wallet create --agent ${opts.agent}`));
            process.exit(1);
          }
          walletId = w.id;
        }

        spinner.text = `Sending ${opts.amount} ${opts.token} → ${opts.to}…`;
        const result = await client.wallets.transfer(walletId, {
          toAddress: opts.to,
          amount: opts.amount,
          tokenSymbol: opts.token as 'USDC' | 'ETH',
        });
        const tx = (result as any)?.txHash ?? (result as any)?.data?.txHash ?? result;
        spinner.stop();
        console.log(`\n${c.bold('Transfer sent')}`);
        detail([
          ['Amount',    `${opts.amount} ${opts.token}`],
          ['To',        opts.to],
          ['Tx Hash',   c.id(tx)],
        ]);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  cmd
    .command('x402-fetch')
    .description('Fetch a URL using an agent wallet to pay any x402 (402 Payment Required) challenge')
    .requiredOption('--agent <agentId>', 'Agent ID')
    .requiredOption('--url <url>', 'Target URL to fetch')
    .option('--method <method>', 'HTTP method', 'GET')
    .option('--header <header>', 'Extra header in Key:Value format (repeatable)', collect, [])
    .option('--body <body>', 'Request body string')
    .option('--json', 'Output response as JSON')
    .action(async (opts) => {
      const client = makeClient();
      const spinner = spin(`Fetching ${opts.url}…`);
      try {
        // Parse repeated --header Key:Value flags
        const headers: Record<string, string> = {};
        for (const h of opts.header as string[]) {
          const idx = h.indexOf(':');
          if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        }

        const res = await client.wallets.x402Fetch(opts.agent, {
          url: opts.url,
          method: opts.method,
          headers: Object.keys(headers).length ? headers : undefined,
          body: opts.body,
        });
        spinner.stop();

        if (opts.json) return jsonOut(res);

        console.log(`\n${c.bold('Response')}  status ${res.status}`);
        if (res.status === 200) {
          console.log(c.dim(JSON.stringify(res.body, null, 2).slice(0, 1000)));
        } else {
          console.log(c.warn(JSON.stringify(res.body, null, 2)));
        }
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}

function collect(val: string, acc: string[]) {
  acc.push(val);
  return acc;
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
