import type { LocalAgent, LocalConversation, LocalState } from "@agent-commons/desktop-contract";
import type { CommonAgent } from "@/types/agent";
import { localToolCalls } from "./local-tool-calls";

export function localAgentToCommon(agent: LocalAgent, state: LocalState): CommonAgent {
  return {
    agentId: agent.id,
    name: agent.name,
    avatar: agent.avatar,
    persona: agent.persona ?? agent.description ?? "",
    instructions: agent.instructions,
    description: agent.description,
    address: agent.id,
    mode: "userDriven",
    core_tools: [],
    common_tools: [],
    external_tools: [],
    knowledgebase: "",
    memory: "",
    owner: state.account?.userId ?? "local-workspace",
    isDefault: agent.isDefault,
    modelProvider: "ollama",
    modelId: agent.model || state.settings.defaultModel,
    temperature: 0.3,
    maxTokens: 4096,
    stopSequences: [],
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    runtimeType: "native",
    runtimeStatus: "running",
  };
}

export function localConversationToSession(conversation: LocalConversation) {
  return {
    sessionId: conversation.id,
    agentId: conversation.agentId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    tasks: [],
    childSessions: [],
    spaces: [],
    history: conversation.messages.map((message, index) => ({
      role: message.role,
      content: message.content,
      timestamp: message.createdAt,
      metadata: message.role === "assistant" ? {
        toolCalls: localToolCalls(conversation.messages, index),
        artifacts: index === conversation.messages.length - 1
          ? conversation.artifacts?.map((artifact) => ({ fileId: artifact.id, name: artifact.name }))
          : undefined,
        localConversationId: conversation.id,
      } : undefined,
      ...(message.role === "tool" ? { name: message.toolName } : {}),
    })),
  };
}
