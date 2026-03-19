import { Command } from 'commander';
import * as readline from 'readline';
import { loadConfig, saveConfig, clearConfig, makeClient, DEFAULT_API_URL } from '../config.js';
import { c, sym, detail, printError } from '../ui.js';

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: hidden ? undefined : process.stdout,
      terminal: hidden,
    });
    if (hidden) {
      process.stdout.write(question);
      process.stdin.once('data', (data) => {
        process.stdout.write('\n');
        rl.close();
        resolve(data.toString().trim());
      });
      process.stdin.setRawMode?.(false);
    } else {
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

export function loginCommand(): Command {
  const cmd = new Command('login').description('Configure API credentials');

  cmd
    .option('--api-url <url>', 'API base URL', DEFAULT_API_URL)
    .option('--api-key <key>', 'API key (or set AGC_API_KEY env var)')
    .option('--initiator <id>', 'Default initiator ID (wallet address or user ID)')
    .action(async (opts) => {
      try {
        const current = loadConfig();

        const apiUrl = opts.apiUrl !== DEFAULT_API_URL
          ? opts.apiUrl
          : (await prompt(`API URL [${current.apiUrl ?? DEFAULT_API_URL}]: `)) || (current.apiUrl ?? DEFAULT_API_URL);

        // Derive the commons-app URL from the API URL
        const appUrl = apiUrl.includes('localhost')
          ? 'http://localhost:3000'
          : apiUrl.replace(/\/api$/, '').replace('api.', '').replace(':3001', ':3000');

        let apiKey = opts.apiKey;
        if (!apiKey) {
          console.log(`\n  Generate an API key at:\n  ${c.bold(`${appUrl}/settings/api-keys`)}\n`);
          apiKey = await prompt(`API Key (sk-ac-...): `);
          if (!apiKey) apiKey = current.apiKey;
        }

        let initiator = opts.initiator;
        if (!initiator) {
          initiator = await prompt(`Wallet address (0x...): `);
          if (!initiator) initiator = current.initiator;
        }

        saveConfig({ apiUrl, apiKey, initiator });
        console.log(`\n${sym.ok} Credentials saved to ~/.agc/config.json`);
        console.log(c.dim('  Run `agc whoami` to verify the connection.'));
      } catch (err) {
        printError(err);
        process.exit(1);
      }
    });

  return cmd;
}

export function logoutCommand(): Command {
  return new Command('logout')
    .description('Clear stored credentials')
    .action(() => {
      clearConfig();
      console.log(`${sym.ok} Credentials cleared.`);
    });
}

export function whoamiCommand(): Command {
  return new Command('whoami')
    .description('Show current configuration and verify API connectivity')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const cfg = loadConfig();

      if (opts.json) {
        console.log(JSON.stringify({ apiUrl: cfg.apiUrl, initiator: cfg.initiator, hasApiKey: !!cfg.apiKey }, null, 2));
        return;
      }

      console.log(`\n${c.bold('Current configuration')}`);
      detail([
        ['API URL',     cfg.apiUrl],
        ['Initiator',   cfg.initiator ?? c.dim('(not set)')],
        ['API Key',     cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : c.dim('(not set)')],
        ['Agent ID',    cfg.defaultAgentId ?? c.dim('(not set)')],
      ]);

      // Connectivity check — try listing agents
      try {
        const client = makeClient();
        if (cfg.initiator) {
          await client.agents.list(cfg.initiator);
          console.log(`\n${sym.ok} ${c.success('Connected')} to ${cfg.apiUrl}`);
        } else {
          console.log(`\n${c.warn('⚠')}  Set an initiator to verify connectivity.`);
        }
      } catch (err: any) {
        console.log(`\n${sym.fail} ${c.error('Could not reach API')}: ${err.message}`);
      }
    });
}

export function configCommand(): Command {
  const cmd = new Command('config').description('Get or set configuration values');

  cmd
    .command('set <key> <value>')
    .description('Set a config value (apiUrl, apiKey, initiator, defaultAgentId)')
    .action((key: string, value: string) => {
      const allowed = ['apiUrl', 'apiKey', 'initiator', 'defaultAgentId'];
      if (!allowed.includes(key)) {
        console.error(c.error(`Unknown key "${key}". Allowed: ${allowed.join(', ')}`));
        process.exit(1);
      }
      saveConfig({ [key]: value } as any);
      console.log(`${sym.ok} ${key} = ${key === 'apiKey' ? '****' : value}`);
    });

  cmd
    .command('get [key]')
    .description('Get a config value or show all')
    .action((key?: string) => {
      const cfg = loadConfig();
      if (key) {
        console.log((cfg as any)[key] ?? c.dim('(not set)'));
      } else {
        detail([
          ['apiUrl',       cfg.apiUrl],
          ['initiator',    cfg.initiator ?? ''],
          ['apiKey',       cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : ''],
          ['defaultAgentId', cfg.defaultAgentId ?? ''],
        ]);
      }
    });

  return cmd;
}
