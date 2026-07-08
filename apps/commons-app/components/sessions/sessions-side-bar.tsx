"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeft, PlusCircle, Loader2, Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionsList from "@/components/sessions/sessions-list";
import { SearchTrigger } from "@/components/search/search-trigger";
import { useRouter } from "next/navigation";
import { useAgentContext } from "@/context/AgentContext";
import { useSessionMutations } from "@/hooks/sessions/use-session-mutations";

export function SessionsSideBar({
  username,
  sessions,
  agentId,
  currentSessionId,
  isLoadingSessions = false,
}: {
  username: string;
  sessions: any[];
  agentId: string;
  currentSessionId?: string;
  isLoadingSessions?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const router = useRouter();
  const { setSessions, streamingTitleSessionId, streamingTitleText } =
    useAgentContext();
  const { renameSession, deleteSession } = useSessionMutations();

  const handleRename = async (sessionId: string, title: string) => {
    const prev = sessions;
    setSessions((list) =>
      list.map((s) => (s.sessionId === sessionId ? { ...s, title } : s))
    );
    const ok = await renameSession(sessionId, title);
    if (!ok) setSessions(prev);
    return ok;
  };

  const handleDelete = async (sessionId: string) => {
    const prev = sessions;
    setSessions((list) => list.filter((s) => s.sessionId !== sessionId));
    const ok = await deleteSession(sessionId);
    if (!ok) {
      setSessions(prev);
    } else if (sessionId === currentSessionId) {
      router.push(`/agents/${agentId}`);
    }
    return ok;
  };

  return (
    <div
      className={cn(
        "h-screen bg-background border-r border-border flex flex-col transition-all duration-300 shrink-0",
        isOpen ? "w-[240px]" : "w-[52px]"
      )}
    >
      {/* Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-border/60">
        {isOpen ? (
          <>
            <Link href="/studio/agents" className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium truncate">Sessions</span>
            </Link>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground ml-2 shrink-0"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="text-muted-foreground hover:text-foreground mx-auto"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search + New session */}
      {isOpen ? (
        <div className="px-2 py-2 space-y-2">
          <SearchTrigger />
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 justify-center"
            onClick={() => router.push(`/agents/${agentId}`)}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            New Session
          </Button>
        </div>
      ) : (
        <div className="px-2 py-2 flex flex-col items-center gap-3">
          <SearchTrigger collapsed />
          <button
            className="text-muted-foreground hover:text-foreground"
            aria-label="New Session"
            title="New Session"
            onClick={() => router.push(`/agents/${agentId}`)}
          >
            <PlusCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sessions list */}
      {isOpen && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Recents
            </span>
            {isLoadingSessions && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>

          <ScrollArea className="flex-1 px-1">
            {isLoadingSessions ? (
              <div className="space-y-1 px-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-8 rounded-md bg-muted animate-pulse"
                    style={{ opacity: 1 - i * 0.15 }}
                  />
                ))}
              </div>
            ) : (
              <SessionsList
                sessions={sessions}
                currentSessionId={currentSessionId}
                onRename={handleRename}
                onDelete={handleDelete}
                streamingTitleSessionId={streamingTitleSessionId}
                streamingTitleText={streamingTitleText}
              />
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
