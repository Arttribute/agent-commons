import type { ChatRequest } from "@agent-commons/desktop-contract";

// Keep deliberate reasoning for execution; avoid another long reasoning pass
// merely to summarize outputs whose creation has already been confirmed.
export function localTaskReasoning(effort: ChatRequest["reasoningEffort"], complexTask: boolean, outputsConfirmed: boolean) {
  if (effort) return ["medium", "high", "xhigh", "max"].includes(effort);
  return complexTask && !outputsConfirmed;
}
