"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { normalizePrincipalId } from "@/lib/principal-id";
import { cn } from "@/lib/utils";
import { AgentsListPane } from "./agents-list-pane";

/**
 * The agents chat app: your agents on the left, the open chat on the right.
 * On phones the list and the chat are separate screens.
 */
export function AgentsChatShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/studio/agents";
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const segment = pathname.split("/")[3];
  const selectedAgentId = segment && segment !== "create" ? decodeURIComponent(segment) : undefined;
  const showingDetail = Boolean(segment);

  return (
    <div className="flex h-full min-h-0">
      <AgentsListPane
        userAddress={userAddress}
        selectedAgentId={selectedAgentId}
        className={cn("w-full border-border md:w-[300px] md:shrink-0 md:border-r lg:w-[320px]", showingDetail && "max-md:hidden")}
      />
      <section className={cn("flex min-w-0 flex-1 flex-col bg-page", !showingDetail && "max-md:hidden")}>{children}</section>
    </div>
  );
}
