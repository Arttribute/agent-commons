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
  DEFAULT_IDENTITY_URL,
  DEFAULT_IDENTITY_CLIENT_ID,
  ensureAccessToken,
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
    .option('--identity-url <url>', 'Commons Identity URL', DEFAULT_IDENTITY_URL)
    .option('--api-key <key>', 'API key (or set AGC_API_KEY env var)')
    .option('--initiator <id>', 'User/initiator ID (advanced — usually auto-detected)')
    .action(async (opts) => {
      try {
        const current = loadConfig();
        const isFirstRun = !existsSync(CONFIG_FILE);

        banner();

        if (isFirstRun) {
          console.log(c.bold('  Welcome to Agent Commons CLI!'));
          console.log(c.dim('  Sign in once with your Commons account to get started.\n'));
        } else {
          console.log(c.bold('  Update your credentials'));
          console.log(c.dim('  Press Enter to keep existing values.\n'));
        }

        // ── API endpoint (advanced / non-default only) ─────────────────────
        let apiUrl: string;
        if (opts.apiUrl !== DEFAULT_API_URL) {
          // User explicitly passed a custom URL via --api-url flag
          apiUrl = opts.apiUrl;
          console.log(`  ${c.dim('Using API endpoint:')} ${apiUrl}\n`);
        } else if (current.apiUrl && current.apiUrl !== DEFAULT_API_URL) {
          // Keep their existing non-default URL
          apiUrl = current.apiUrl;
          console.log(`  ${c.dim('Using existing endpoint:')} ${apiUrl}\n`);
        } else {
          apiUrl = DEFAULT_API_URL;
        }

        // Derive the commons-app URL from the API URL
        const appUrl = apiUrl.includes('localhost')
          ? 'http://localhost:3000'
          : DEFAULT_APP_URL;
        const apiKeysUrl = `${appUrl}/settings/api-keys`;

        if (!opts.apiKey) {
          step(1, 1, 'Commons account');
          const identityUrl = String(opts.identityUrl).replace(/\/$/, '');
          const clientId = DEFAULT_IDENTITY_CLIENT_ID;
          const deviceResponse = await fetch(`${identityUrl}/api/auth/device/code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              scope:
                'openid profile email offline_access agents:read agents:write agents:run compute:read compute:write activity:read usage:read',
            }),
          });
          const device = (await deviceResponse.json()) as {
            device_code?: string;
            user_code?: string;
            verification_uri_complete?: string;
            expires_in?: number;
            interval?: number;
            error_description?: string;
          };
          if (!deviceResponse.ok || !device.device_code || !device.user_code) {
            throw new Error(device.error_description || 'Could not start Commons login.');
          }

          const verificationUrl =
            device.verification_uri_complete ??
            `${identityUrl}/device?user_code=${encodeURIComponent(device.user_code)}`;
          console.log(`  ${c.dim('Authorize this CLI in your browser:')}`);
          console.log(`  ${c.primary(verificationUrl)}`);
          console.log(`  ${c.dim('Code:')} ${c.bold(device.user_code)}\n`);
          openBrowser(verificationUrl);

          const deadline = Date.now() + (device.expires_in ?? 600) * 1000;
          let intervalMs = Math.max(device.interval ?? 5, 1) * 1000;
          let sessionToken: string | undefined;
          while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
            const tokenResponse = await fetch(`${identityUrl}/api/auth/device/token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: device.device_code,
                client_id: clientId,
              }),
            });
            const token = (await tokenResponse.json()) as {
              access_token?: string;
              error?: string;
              error_description?: string;
            };
            if (tokenResponse.ok && token.access_token) {
              sessionToken = token.access_token;
              break;
            }
            if (token.error === 'slow_down') {
              intervalMs += 1000;
              continue;
            }
            if (token.error === 'authorization_pending') continue;
            throw new Error(token.error_description || token.error || 'Commons login failed.');
          }
          if (!sessionToken) throw new Error('Commons login expired before approval.');

          saveConfig({
            apiUrl,
            identityUrl,
            identityClientId: clientId,
            sessionToken,
            accessToken: undefined,
            accessTokenExpiresAt: undefined,
            apiKey: undefined,
          });
          const authenticated = await ensureAccessToken();
          console.log(
            `  ${sym.ok} ${c.success('Signed in')} as ${c.id(authenticated.userId ?? 'Commons user')}`,
          );
          console.log(`\n  ${sym.ok} ${c.success('All set!')} Credentials saved to ${c.dim('~/.agc/config.json')}\n`);
          return;
        }

        // ── Legacy API key fallback ─────────────────────────────────────────
        step(1, 1, 'Legacy API Key');

        let apiKey = opts.apiKey;
        if (!apiKey) {
          console.log(`  ${c.dim('You\'ll need an API key from your Agent Commons account.')}`);
          console.log(`  ${c.dim('We\'ll open the API Keys page in your browser.')}\n`);
          console.log(`  ${c.dim('On that page:')}`);
          console.log(`  ${sym.bullet} ${c.dim('Click')} ${c.bold('"Generate new key"')}`);
          console.log(`  ${sym.bullet} ${c.dim('Copy the key (it starts with')} ${c.bold('sk-ac-…')}${c.dim(')')}`);
          console.log(`  ${sym.bullet} ${c.dim('Paste it here when prompted')}\n`);

          const openNow = await prompt(`  ${c.dim('Open browser now? [Y/n]:')} `);
          if (!openNow || openNow.toLowerCase() !== 'n') {
            openBrowser(apiKeysUrl);
            console.log(`  ${sym.ok} ${c.dim('Opened:')} ${c.primary(apiKeysUrl)}\n`);
          } else {
            console.log(`  ${c.dim('You can open it manually:')} ${c.primary(apiKeysUrl)}\n`);
          }

          console.log(c.dim('  Paste your API key below (input is hidden):'));
          apiKey = await prompt(`  ${c.dim('API Key:')} `, true);
          if (!apiKey) apiKey = current.apiKey;
        }

        if (!apiKey) {
          console.log(`\n  ${c.warn('⚠')}  No API key provided — set one later with ${c.bold('agc config set apiKey <key>')}`);
        } else {
          console.log(`  ${sym.ok} ${c.dim('Key saved:')} ****${apiKey.slice(-4)}`);
        }

        // ── Initiator (auto-detect from API key) ──────────────────────────
        let initiator = opts.initiator ?? current.initiator;

        if (!initiator && apiKey) {
          try {
            const { CommonsClient } = await import('@agent-commons/sdk');
            const client = new CommonsClient({ baseUrl: apiUrl, apiKey });
            const me = await client.auth.me();
            if (me?.principalId && me.principalType === 'user') {
              initiator = me.principalId;
              console.log(`  ${sym.ok} ${c.dim('Identity detected:')} ${c.id(initiator.slice(0, 10) + '…' + initiator.slice(-6))}`);
            }
          } catch {
            // /v1/auth/me unreachable — skip silently
          }
        }

        // ── Save ───────────────────────────────────────────────────────────
        saveConfig({ apiUrl, apiKey, ...(initiator ? { initiator } : {}) });

        console.log(`\n  ${sym.ok} ${c.success('All set!')}  Credentials saved to ${c.dim('~/.agc/config.json')}`);
        console.log(`\n  ${c.dim('Next steps:')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc')} ${c.dim('to open the interactive menu')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc agents list')} ${c.dim('to see your agents')}`);
        console.log(`  ${sym.arrow} ${c.dim('Run')} ${c.bold('agc chat')} ${c.dim('to start chatting with an agent')}\n`);
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
        console.log(JSON.stringify({
          apiUrl: cfg.apiUrl,
          identityUrl: cfg.identityUrl,
          userId: cfg.userId ?? cfg.initiator,
          workspaceId: cfg.workspaceId,
          authenticated: Boolean(cfg.sessionToken || cfg.apiKey),
        }, null, 2));
        return;
      }

      console.log(`\n${c.bold('Current configuration')}`);
      detail([
        ['API URL',     cfg.apiUrl],
        ['Identity',    cfg.userId ?? cfg.initiator ?? c.dim('(not set)')],
        ['Workspace',   cfg.workspaceId ?? c.dim('(not set)')],
        ['Auth',        cfg.sessionToken ? 'Commons account' : cfg.apiKey ? 'Legacy API key' : c.dim('(not set)')],
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
