import { AgentProvider } from "@/context/AgentContext";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentProvider>{children}</AgentProvider>;
}
