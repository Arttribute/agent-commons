export type ResourceType =
  | "function"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "csv"
  | "other";

export type AgentMode = "fullyAutonomous" | "userDriven";

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
  // TTS
  ttsProvider?: string;
  ttsVoice?: string;
}
