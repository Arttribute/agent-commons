import type { AgentSandboxStepTarget } from "@/types/skills";

export type SandboxLog = {
  level: "success" | "warning" | "info" | "error";
  message: string;
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

export type SandboxResumeState = {
  agentName?: string;
  persona?: string;
  systemPrompt?: string;
  selectedSkills?: string[];
  skillInstructions?: Record<string, string>;
  selectedTools?: string[];
  taskTitle?: string;
  activePanel?: ConfigPanel;
  guideIndex?: number;
  createdAgentId?: string;
  completionSent?: boolean;
  creditReward?: number;
  chatInput?: string;
  messages?: ChatMessage[];
  logs?: SandboxLog[];
  reviews?: Record<string, ReviewResult>;
};

export type ConfigPanel = "identity" | "skills" | "tools";

export const targetToPanel: Partial<Record<AgentSandboxStepTarget, ConfigPanel>> = {
  identity: "identity",
  system_prompt: "identity",
  skills: "skills",
  tools: "tools",
  connectors: "tools",
};
