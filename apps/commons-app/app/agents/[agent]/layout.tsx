import { AgentProvider } from "@/context/AgentContext";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentProvider>{children}</AgentProvider>;
}
