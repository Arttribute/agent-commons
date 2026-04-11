import { Command } from 'commander';
import * as readline from 'readline';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  makeClient,
  DEFAULT_API_URL,
  DEFAULT_APP_URL,
} from '../config.js';
import { c, sym, step, banner, detail, openBrowser, printError } from '../ui.js';

const CONFIG_FILE = join(homedir(), '.agc', 'config.json');

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
        const isFirstRun = !existsSync(CONFIG_FILE);

        banner();

        if (isFirstRun) {
          console.log(c.bold('  Welcome to Agent Commons CLI!'));
          console.log(c.dim('  Let\'s get you set up in three quick steps.\n'));
        } else {
          console.log(c.bold('  Update your credentials'));
          console.log(c.dim('  Press Enter to keep existing values.\n'));
        }

        // ── Step 1: API endpoint ───────────────────────────────────────────
        step(1, 3, 'API Endpoint');

        const defaultUrl = current.apiUrl ?? DEFAULT_API_URL;
        let apiUrl: string;

        if (opts.apiUrl !== DEFAULT_API_URL) {
          apiUrl = opts.apiUrl;
          console.log(`  ${c.dim('Using:')} ${apiUrl}`);
        } else {
          const answer = await prompt(
            `  ${c.dim('URL')} [${c.dim(defaultUrl)}]: `,
          );
          apiUrl = answer || defaultUrl;
        }
        console.log(`  ${sym.ok} ${c.dim('Endpoint:')} ${c.primary(apiUrl)}`);

        // Derive the commons-app URL from the API URL
        const appUrl = apiUrl.includes('localhost')
          ? 'http://localhost:3000'
          : DEFAULT_APP_URL;
        const settingsUrl = `${appUrl}/settings`;

        // ── Step 2: API key ────────────────────────────────────────────────
        step(2, 3, 'API Key');

        let apiKey = opts.apiKey;
        if (!apiKey) {
          console.log(`  ${sym.arrow} Opening your browser to generate an API key…`);
          console.log(`  ${c.dim(settingsUrl)}\n`);
          openBrowser(settingsUrl);

          console.log(c.dim('  Once you have your key, paste it below.'));
          console.log(c.dim('  (Keys look like:  sk-ac-xxxxxxxxxxxxxxxx)\n'));
          apiKey = await prompt(`  ${c.dim('API Key:')} `);
          if (!apiKey) apiKey = current.apiKey;
        }

        if (!apiKey) {
          console.log(`\n  ${c.warn('⚠')}  No API key provided — you can set one later with ${c.bold('agc config set apiKey <key>')}`);
        } else {
          console.log(`  ${sym.ok} ${c.dim('Key saved:')} ****${apiKey.slice(-4)}`);
        }

        // ── Step 3: Identity ──────────────────────────────────────────────
        step(3, 3, 'Your Identity');

        let initiator = opts.initiator;
        if (!initiator) {
          const defaultInitiator = current.initiator ?? '';
          const hint = defaultInitiator ? `[${c.dim(defaultInitiator.slice(0, 8) + '…')}] ` : '';
          initiator = await prompt(`  ${c.dim('Wallet address (0x…):')} ${hint}`);
          if (!initiator) initiator = current.initiator;
        }

        if (!initiator) {
          console.log(`  ${c.warn('⚠')}  No wallet address — set one later with ${c.bold('agc config set initiator <address>')}`);
        } else {
          console.log(`  ${sym.ok} ${c.dim('Address:')} ${c.id(initiator.slice(0, 10) + '…' + initiator.slice(-6))}`);
        }

        // ── Save ───────────────────────────────────────────────────────────
        saveConfig({ apiUrl, apiKey, initiator });

        console.log(`\n  ${sym.ok} ${c.success('All set!')}  Credentials saved to ${c.dim('~/.agc/config.json')}`);
        console.log(`\n  ${c.dim('Next steps:')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc')} ${c.dim('for an interactive menu')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc whoami')} ${c.dim('to verify your connection')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc chat --agent <id>')} ${c.dim('to start chatting')}\n`);
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
