export type ResourceType =
  | "function"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "csv"
  | "other";

export type AgentMode = "fullyAutonomous" | "userDriven";
export type AgentRuntimeType = "native" | "openclaw" | "hermes" | "custom";

export interface Resource {
  image: string | undefined;
  title: string;
  resourceId: string;
  embedding: number[];
  resourceType: ResourceType;
  schema?: string;
  tags?: string[];
}

export interface CommonAgent {
  agentId: string;
  name: string;
  avatar?: string;
  persona: string;
  instructions: string;
  greeting?: string;
  conversationStarters?: string[];
  description?: string;
  address: string;
  mode: AgentMode;
  autoInterval?: number;
  core_tools: string[];
  common_tools: string[];
  external_tools: string[];
  knowledgebase: string;
  memory: string;
  owner: string;
  isDefault?: boolean;
  isSystemManaged?: boolean;
  copilotAccessMode?: "full" | "scoped" | "confirm" | null;
  copilotScopes?: string[];
  // LLM model config
  modelProvider?: string;
  modelId?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  temperature: number;
  maxTokens: number;
  stopSequences: string[];
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  runtimeType?: AgentRuntimeType;
  runtimeVersion?: string;
  runtimeStatus?: string;
  runtimeConfig?: {
    deploymentMode?: "managed" | "external";
    channelPolicy?: "pairing" | "allowlist" | "open" | "disabled";
    enabledPlugins?: string[];
    enabledToolsets?: string[];
    memoryMode?: "native" | "platform" | "hybrid";
  };
  // TTS
  ttsProvider?: string;
  ttsVoice?: string;
}
