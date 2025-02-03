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
  resourceId: string;
  embedding: number[];
  resourceType: ResourceType;
  json_schema?: string;
  tags?: string[];
}

export interface CommonAgent {
  agentId: string;
  name: string;
  profileImage?: string;
  persona: string;
  instruction: string;
  address: string;
  mode: AgentMode;
  autoInterval?: number;
  core_tools: string[];
  common_tools: string[];
  external_tools: string[];
  knowledgebase: string;
  memory: string;
  owner: string;
}
