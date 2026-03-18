"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeft, PlusCircle, Loader2, Bot } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionsList from "@/components/sessions/sessions-list";
import { useRouter } from "next/navigation";

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

      {/* New session button */}
      <div className="px-2 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 justify-center"
          onClick={() => router.push(`/agents/${agentId}`)}
        >
          {isOpen ? (
            <>
              <PlusCircle className="h-3.5 w-3.5" />
              New Session
            </>
          ) : (
            <PlusCircle className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Sessions list */}
      {isOpen && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Recent
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
                    className="h-9 rounded-md bg-muted animate-pulse"
                    style={{ opacity: 1 - i * 0.15 }}
                  />
                ))}
              </div>
            ) : (
              <SessionsList sessions={sessions} currentSessionId={currentSessionId} />
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
