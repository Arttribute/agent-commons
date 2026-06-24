import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { CommonsClient } from '@agent-commons/sdk';

export interface AgcConfig {
  apiUrl: string;
  identityUrl?: string;
  identityClientId?: string;
  sessionToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  userId?: string;
  workspaceId?: string;
  apiKey?: string;
  initiator?: string;
  defaultAgentId?: string;
}

const CONFIG_DIR = join(homedir(), '.agc');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const DEFAULT_API_URL = process.env.AGC_API_URL ?? 'https://api.agentcommons.io';
export const DEFAULT_APP_URL = 'https://www.agentcommons.io';
export const DEFAULT_IDENTITY_URL =
  process.env.COMMONS_IDENTITY_URL ?? 'https://auth.agentcommons.io';
export const DEFAULT_IDENTITY_CLIENT_ID =
  process.env.COMMONS_IDENTITY_CLIENT_ID ?? 'commons-cli';

export function loadConfig(): AgcConfig {
  // Env vars take precedence over file
  const fromEnv: Partial<AgcConfig> = {
    ...(process.env.AGC_API_URL && { apiUrl: process.env.AGC_API_URL }),
    ...(process.env.AGC_API_KEY && { apiKey: process.env.AGC_API_KEY }),
    ...(process.env.COMMONS_ACCESS_TOKEN && { accessToken: process.env.COMMONS_ACCESS_TOKEN }),
    ...(process.env.COMMONS_IDENTITY_URL && { identityUrl: process.env.COMMONS_IDENTITY_URL }),
    ...(process.env.AGC_INITIATOR && { initiator: process.env.AGC_INITIATOR }),
    ...(process.env.AGC_AGENT_ID && { defaultAgentId: process.env.AGC_AGENT_ID }),
  };

  let fromFile: Partial<AgcConfig> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      fromFile = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      // ignore corrupt config
    }
  }

  return {
    apiUrl: DEFAULT_API_URL,
    identityUrl: DEFAULT_IDENTITY_URL,
    identityClientId: DEFAULT_IDENTITY_CLIENT_ID,
    ...fromFile,
    ...fromEnv,
  };
}

export function saveConfig(updates: Partial<AgcConfig>): void {
  const current = loadConfig();
  const next = { ...current, ...updates };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(
      CONFIG_FILE,
      JSON.stringify(
        {
          apiUrl: DEFAULT_API_URL,
          identityUrl: DEFAULT_IDENTITY_URL,
          identityClientId: DEFAULT_IDENTITY_CLIENT_ID,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}

export function makeClient(overrides?: Partial<AgcConfig>): CommonsClient {
  const cfg = { ...loadConfig(), ...overrides };
  return new CommonsClient({
    baseUrl: cfg.apiUrl,
    apiKey: cfg.accessToken ?? cfg.apiKey,
    initiator: cfg.userId ?? cfg.initiator,
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export async function ensureAccessToken(): Promise<AgcConfig> {
  const cfg = loadConfig();
  if (cfg.apiKey && !cfg.sessionToken) return cfg;
  if (
    cfg.accessToken &&
    cfg.accessTokenExpiresAt &&
    cfg.accessTokenExpiresAt > Date.now() + 30_000
  ) {
    return cfg;
  }
  if (!cfg.sessionToken || !cfg.identityUrl) return cfg;

  const response = await fetch(
    `${cfg.identityUrl.replace(/\/$/, '')}/api/auth/token`,
    { headers: { Authorization: `Bearer ${cfg.sessionToken}` } },
  );
  if (!response.ok) {
    throw new Error('Your Commons login has expired. Run `agc login` again.');
  }
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error('Commons Identity did not return an access token.');
  const claims = decodeJwtPayload(data.token);
  const updates: Partial<AgcConfig> = {
    accessToken: data.token,
    accessTokenExpiresAt:
      typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + 10 * 60 * 1000,
    userId: typeof claims.sub === 'string' ? claims.sub : cfg.userId,
    workspaceId:
      typeof claims.workspace_id === 'string' ? claims.workspace_id : cfg.workspaceId,
    initiator: typeof claims.sub === 'string' ? claims.sub : cfg.initiator,
  };
  saveConfig(updates);
  return { ...cfg, ...updates };
}

export function requireConfig(cfg: AgcConfig): void {
  if (!cfg.accessToken && !cfg.apiKey && process.env.API_AUTH_REQUIRED !== 'false') {
    // Soft warning — API may not require auth
  }
}
