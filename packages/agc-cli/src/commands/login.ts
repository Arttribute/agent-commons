import { Command } from 'commander';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  clearConfig,
  DEFAULT_API_URL,
  DEFAULT_IDENTITY_CLIENT_ID,
  DEFAULT_IDENTITY_URL,
  ensureAccessToken,
  loadConfig,
  makeClient,
  saveConfig,
} from '../config.js';
import {
  banner,
  c,
  detail,
  openBrowser,
  printError,
  spin,
  step,
  sym,
} from '../ui.js';

const CONFIG_FILE = join(homedir(), '.agc', 'config.json');
const CLI_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'activity:read',
  'agents:create',
  'agents:read',
  'agents:write',
  'agents:run',
  'compute:read',
  'compute:write',
  'usage:read',
].join(' ');

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
};

type DeviceTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

async function signInWithCommons(options: {
  apiUrl: string;
  identityUrl: string;
  clientId: string;
  openBrowser: boolean;
}): Promise<void> {
  step(1, 2, 'Connect your Commons account');
  const starting = spin('Creating a secure sign-in request…');
  const response = await fetch(`${options.identityUrl}/api/auth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: options.clientId,
      scope: CLI_SCOPES,
    }),
  });
  const device = await jsonResponse<DeviceCodeResponse>(response);
  starting.stop();
  if (!response.ok || !device.device_code || !device.user_code) {
    throw new Error(
      device.error_description ??
        device.error ??
        `Could not start Commons sign-in (${response.status}).`,
    );
  }

  const verificationUrl =
    device.verification_uri_complete ??
    `${device.verification_uri ?? `${options.identityUrl}/device`}?user_code=${encodeURIComponent(device.user_code)}`;

  console.log(`\n  ${c.dim('Open this page to approve the CLI:')}`);
  console.log(`  ${c.primary(verificationUrl)}`);
  console.log(`\n  ${c.dim('One-time code')}  ${c.bold(device.user_code)}\n`);
  if (options.openBrowser) {
    openBrowser(verificationUrl);
    console.log(`  ${sym.arrow} ${c.dim('Your browser should open automatically.')}`);
  } else {
    console.log(`  ${sym.arrow} ${c.dim('Open the URL in any browser.')}`);
  }

  step(2, 2, 'Approve in your browser');
  const waiting = spin('Waiting for approval…');
  const deadline = Date.now() + (device.expires_in ?? 600) * 1000;
  let intervalMs = Math.max(device.interval ?? 5, 1) * 1000;
  let sessionToken: string | undefined;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const tokenResponse = await fetch(
      `${options.identityUrl}/api/auth/device/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: device.device_code,
          client_id: options.clientId,
        }),
      },
    );
    const token = await jsonResponse<DeviceTokenResponse>(tokenResponse);
    if (tokenResponse.ok && token.access_token) {
      sessionToken = token.access_token;
      break;
    }
    if (token.error === 'slow_down') {
      intervalMs += 1_000;
      continue;
    }
    if (token.error === 'authorization_pending') continue;
    waiting.stop();
    throw new Error(
      token.error_description ?? token.error ?? 'Commons sign-in failed.',
    );
  }

  waiting.stop();
  if (!sessionToken) {
    throw new Error('The sign-in request expired before it was approved.');
  }

  saveConfig({
    apiUrl: options.apiUrl,
    identityUrl: options.identityUrl,
    identityClientId: options.clientId,
    sessionToken,
    accessToken: undefined,
    accessTokenExpiresAt: undefined,
    apiKey: undefined,
  });
  const authenticated = await ensureAccessToken();
  const identity =
    authenticated.userEmail ??
    authenticated.userName ??
    authenticated.userId ??
    'Commons user';
  console.log(`\n  ${sym.ok} ${c.success('Signed in')}  ${c.bold(identity)}`);
  if (authenticated.workspaceId) {
    console.log(
      `  ${sym.ok} ${c.dim('Workspace')}  ${c.id(authenticated.workspaceId)}`,
    );
  }
}

async function useApiKey(options: {
  apiUrl: string;
  apiKey: string;
  initiator?: string;
}): Promise<void> {
  step(1, 1, 'Verify API key');
  const checking = spin('Checking credentials…');
  try {
    const { CommonsClient } = await import('@agent-commons/sdk');
    const client = new CommonsClient({
      baseUrl: options.apiUrl,
      apiKey: options.apiKey,
    });
    const principal = await client.auth.me();
    const initiator =
      options.initiator ??
      (principal.principalType === 'user'
        ? principal.principalId ?? undefined
        : undefined);
    saveConfig({
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      initiator,
      sessionToken: undefined,
      accessToken: undefined,
      accessTokenExpiresAt: undefined,
      userId: initiator,
    });
    checking.stop();
    console.log(`\n  ${sym.ok} ${c.success('API key verified')}`);
    if (principal.principalId) {
      console.log(
        `  ${sym.ok} ${c.dim('Principal')}  ${c.id(principal.principalId)}`,
      );
    }
  } catch (error) {
    checking.stop();
    throw error;
  }
}

export function loginCommand(): Command {
  return new Command('login')
    .description('Sign in with your Commons account')
    .option('--api-url <url>', 'Use a custom Agent Commons API endpoint')
    .option('--identity-url <url>', 'Use a custom Commons Identity endpoint')
    .option('--client-id <id>', 'Override the public CLI identity client ID')
    .option('--no-browser', 'Do not open the authorization page automatically')
    .option('--api-key <key>', 'Use a project API key for automation')
    .option('--initiator <id>', 'Optional delegated principal for compatible keys')
    .action(async (opts) => {
      try {
        const current = loadConfig();
        const firstRun = !existsSync(CONFIG_FILE);
        const apiUrl = String(opts.apiUrl ?? current.apiUrl ?? DEFAULT_API_URL).replace(
          /\/$/,
          '',
        );
        const identityUrl = String(
          opts.identityUrl ?? current.identityUrl ?? DEFAULT_IDENTITY_URL,
        ).replace(/\/$/, '');
        const clientId = String(
          opts.clientId ??
            current.identityClientId ??
            DEFAULT_IDENTITY_CLIENT_ID,
        );

        banner();
        console.log(
          c.bold(
            firstRun
              ? '  Welcome — let’s connect your Agent Commons account.'
              : '  Sign in to Agent Commons',
          ),
        );
        console.log(
          c.dim(
            opts.apiKey
              ? '  API-key mode is intended for automation and CI.\n'
              : '  A browser approval keeps passwords and API keys out of your terminal.\n',
          ),
        );

        if (opts.apiKey) {
          await useApiKey({
            apiUrl,
            apiKey: String(opts.apiKey),
            initiator: opts.initiator,
          });
        } else {
          await signInWithCommons({
            apiUrl,
            identityUrl,
            clientId,
            openBrowser: opts.browser !== false,
          });
        }

        console.log(
          `\n  ${sym.ok} ${c.success('Ready.')} ${c.dim('Credentials are stored with user-only permissions.')}`,
        );
        console.log(`  ${sym.arrow} ${c.bold('agc')} ${c.dim('open the command center')}`);
        console.log(
          `  ${sym.arrow} ${c.bold('agc agents list')} ${c.dim('list your agents')}`,
        );
        console.log(
          `  ${sym.arrow} ${c.bold('agc chat')} ${c.dim('start a conversation')}\n`,
        );
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}

export function logoutCommand(): Command {
  return new Command('logout')
    .description('Sign out and clear locally stored credentials')
    .action(() => {
      clearConfig();
      console.log(`\n  ${sym.ok} Signed out. Local credentials were cleared.\n`);
    });
}

export function whoamiCommand(): Command {
  return new Command('whoami')
    .description('Show the active identity and verify API access')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const cfg = await ensureAccessToken();
        const authenticated = Boolean(
          cfg.sessionToken || cfg.accessToken || cfg.apiKey,
        );
        let principal:
          | { principalId: string | null; principalType: string | null }
          | undefined;
        if (authenticated) principal = await makeClient().auth.me();
        const output = {
          apiUrl: cfg.apiUrl,
          identityUrl: cfg.identityUrl,
          userId: cfg.userId ?? cfg.initiator ?? principal?.principalId,
          email: cfg.userEmail,
          name: cfg.userName,
          workspaceId: cfg.workspaceId,
          principalType: principal?.principalType,
          authMode: cfg.sessionToken
            ? 'commons-account'
            : cfg.apiKey
              ? 'api-key'
              : cfg.accessToken
                ? 'access-token'
                : 'none',
          authenticated,
        };
        if (opts.json) {
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        console.log(`\n${c.bold('Identity')}`);
        detail([
          ['Account', cfg.userEmail ?? cfg.userName ?? c.dim('(not available)')],
          ['User ID', output.userId ?? c.dim('(not available)')],
          ['Workspace', cfg.workspaceId ?? c.dim('(not available)')],
          ['Auth', output.authMode],
          ['API', cfg.apiUrl],
          ['Default agent', cfg.defaultAgentId ?? c.dim('(not set)')],
        ]);
        console.log(
          authenticated
            ? `\n  ${sym.ok} ${c.success('Authenticated and connected')}\n`
            : `\n  ${c.warn('○')} Not signed in. Run ${c.bold('agc login')}.\n`,
        );
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}

export function configCommand(): Command {
  const command = new Command('config').description(
    'Inspect or update CLI preferences',
  );
  const allowed = [
    'apiUrl',
    'identityUrl',
    'apiKey',
    'initiator',
    'defaultAgentId',
  ] as const;

  command
    .command('set <key> <value>')
    .description(`Set a preference (${allowed.join(', ')})`)
    .action((key: string, value: string) => {
      if (!allowed.includes(key as (typeof allowed)[number])) {
        console.error(
          c.error(`Unknown key "${key}". Allowed: ${allowed.join(', ')}`),
        );
        process.exitCode = 1;
        return;
      }
      saveConfig({ [key]: value });
      console.log(
        `${sym.ok} ${key} = ${key === 'apiKey' ? `****${value.slice(-4)}` : value}`,
      );
    });

  command
    .command('get [key]')
    .description('Show one preference or the complete non-secret configuration')
    .action((key?: string) => {
      const cfg = loadConfig();
      if (key) {
        if (['apiKey', 'sessionToken', 'accessToken'].includes(key)) {
          const value = cfg[key as 'apiKey' | 'sessionToken' | 'accessToken'];
          console.log(value ? `****${value.slice(-4)}` : c.dim('(not set)'));
          return;
        }
        console.log(String(cfg[key as keyof typeof cfg] ?? c.dim('(not set)')));
        return;
      }
      detail([
        ['apiUrl', cfg.apiUrl],
        ['identityUrl', cfg.identityUrl],
        ['user', cfg.userEmail ?? cfg.userId ?? cfg.initiator ?? ''],
        ['workspaceId', cfg.workspaceId ?? ''],
        ['auth', cfg.sessionToken ? 'Commons account' : cfg.apiKey ? 'API key' : ''],
        ['defaultAgentId', cfg.defaultAgentId ?? ''],
      ]);
    });

  return command;
}
