"use client";

import { use } from "react";
import { AgentChatView } from "@/components/agents/chat/agent-chat-view";

export default function AgentChatPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = use(params);
  const agentId = decodeURIComponent(agent);
  // A fresh view per agent, so chat state never carries across agents.
  return <AgentChatView key={agentId} agentId={agentId} />;
}
