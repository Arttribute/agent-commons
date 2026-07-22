import type { AgentSandboxStepTarget } from "@/types/skills";

export type SandboxLog = {
  level: "success" | "warning" | "info" | "error";
  message: string;
  occurredAt?: string;
};

export type ReviewResult = {
  score: number;
  passed: boolean;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextRevision: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SandboxSession = {
  id: string;
  platformSessionId?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type SandboxResumeState = {
  agentName?: string;
  persona?: string;
  systemPrompt?: string;
  selectedSkills?: string[];
  skillInstructions?: Record<string, string>;
  selectedTools?: string[];
  selectedTasks?: string[];
  selectedWorkflowId?: string;
  workflowResult?: string[];
  memoryEntries?: Record<string, string>;
  computerCommand?: string;
  computerOutput?: string;
  taskTitle?: string;
  activePanel?: SandboxSection;
  guideIndex?: number;
  createdAgentId?: string;
  completionSent?: boolean;
  creditReward?: number;
  chatInput?: string;
  messages?: ChatMessage[];
  sessions?: SandboxSession[];
  currentSessionId?: string;
  logs?: SandboxLog[];
  reviews?: Record<string, ReviewResult>;
};

export type ConfigPanel =
  | "identity"
  | "skills"
  | "tools"
  | "tasks"
  | "workflows"
  | "memory"
  | "computer";

export type SandboxSection = ConfigPanel | "chat" | "sessions" | "logs";

export const targetToPanel: Partial<
  Record<AgentSandboxStepTarget, SandboxSection>
> = {
  identity: "identity",
  system_prompt: "identity",
  skills: "skills",
  tools: "tools",
  connectors: "tools",
  tasks: "tasks",
  workflows: "workflows",
  memory: "memory",
  computer: "computer",
  chat: "chat",
  logs: "logs",
  publish: "chat",
};
