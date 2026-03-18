import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { CommonsClient } from '@agent-commons/sdk';

export interface AgcConfig {
  apiUrl: string;
  apiKey?: string;
  initiator?: string;
  defaultAgentId?: string;
}

const CONFIG_DIR = join(homedir(), '.agc');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const DEFAULT_API_URL = process.env.AGC_API_URL ?? 'http://localhost:3001';

export function loadConfig(): AgcConfig {
  // Env vars take precedence over file
  const fromEnv: Partial<AgcConfig> = {
    ...(process.env.AGC_API_URL && { apiUrl: process.env.AGC_API_URL }),
    ...(process.env.AGC_API_KEY && { apiKey: process.env.AGC_API_KEY }),
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
    writeFileSync(CONFIG_FILE, JSON.stringify({ apiUrl: DEFAULT_API_URL }, null, 2));
  }
}

export function makeClient(overrides?: Partial<AgcConfig>): CommonsClient {
  const cfg = { ...loadConfig(), ...overrides };
  return new CommonsClient({
    baseUrl: cfg.apiUrl,
    apiKey: cfg.apiKey,
    initiator: cfg.initiator,
  });
}

export function requireConfig(cfg: AgcConfig): void {
  if (!cfg.apiKey && process.env.API_AUTH_REQUIRED !== 'false') {
    // Soft warning — API may not require auth
  }
}
