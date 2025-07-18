import { AgentProvider } from "@/context/AgentContext";
import { SpacesProvider } from "@/context/SpacesContext";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AgentProvider>
      <SpacesProvider>{children}</SpacesProvider>
    </AgentProvider>
  );
}
