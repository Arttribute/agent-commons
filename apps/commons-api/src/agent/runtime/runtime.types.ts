export const AGENT_RUNTIME_TYPES = [
  'native',
  'openclaw',
  'hermes',
  'custom',
] as const;

export type AgentRuntimeType = (typeof AGENT_RUNTIME_TYPES)[number];
export type ManagedAgentRuntimeType = Exclude<AgentRuntimeType, 'native'>;

export type RuntimeStatus =
  | 'disabled'
  | 'provisioning'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'stopped'
  | 'failed';

export type RuntimeCapabilities = {
  streaming: boolean;
  sessions: boolean;
  tools: boolean;
  skills: boolean;
  tasks: boolean;
  workflows: boolean;
  memory: boolean;
  wallets: boolean;
  channels: boolean;
  computer: boolean;
  approvals: boolean;
  delegation: boolean;
};

export const RUNTIME_CHANNEL_IDS = ['telegram', 'whatsapp'] as const;
export type RuntimeChannelId = (typeof RUNTIME_CHANNEL_IDS)[number];

export type RuntimeChannelConfig = {
  enabled: boolean;
  mode?: 'bot' | 'self-chat' | 'cloud';
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  allowFrom?: string[];
  requireMention?: boolean;
  homeTarget?: string;
  credentials?: Record<string, string>;
  clearCredentials?: boolean;
};

export type RuntimeConfig = {
  deploymentMode?: 'managed' | 'external';
  channelPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled';
  enabledPlugins?: string[];
  enabledToolsets?: string[];
  memoryMode?: 'native' | 'platform' | 'hybrid';
  channels?: Partial<Record<RuntimeChannelId, RuntimeChannelConfig>>;
  metadata?: Record<string, unknown>;
};

const COMMON_CAPABILITIES: RuntimeCapabilities = {
  streaming: true,
  sessions: true,
  tools: true,
  skills: true,
  tasks: true,
  workflows: true,
  memory: true,
  wallets: true,
  channels: false,
  computer: true,
  approvals: true,
  delegation: true,
};

export const RUNTIME_CAPABILITIES: Record<
  AgentRuntimeType,
  RuntimeCapabilities
> = {
  native: { ...COMMON_CAPABILITIES },
  openclaw: { ...COMMON_CAPABILITIES, channels: true },
  hermes: { ...COMMON_CAPABILITIES, channels: true },
  custom: {
    ...COMMON_CAPABILITIES,
    skills: false,
    channels: false,
    delegation: false,
  },
};

export function isAgentRuntimeType(value: unknown): value is AgentRuntimeType {
  return (
    typeof value === 'string' &&
    (AGENT_RUNTIME_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeRuntimeType(value: unknown): AgentRuntimeType {
  return isAgentRuntimeType(value) ? value : 'native';
}

export function isManagedRuntime(
  value: unknown,
): value is ManagedAgentRuntimeType {
  const runtime = normalizeRuntimeType(value);
  return runtime !== 'native';
}
