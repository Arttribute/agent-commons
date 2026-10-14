import { AgentsChatShell } from "@/components/agents/chat/agents-chat-shell";

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentsChatShell>{children}</AgentsChatShell>;
}
