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

export type ConfigPanel = "identity" | "prompt" | "skills" | "tools" | "workflow";

export const targetToPanel: Partial<Record<AgentSandboxStepTarget, ConfigPanel>> = {
  identity: "identity",
  system_prompt: "prompt",
  skills: "skills",
  tools: "tools",
  connectors: "tools",
  workflows: "workflow",
  tasks: "workflow",
};
