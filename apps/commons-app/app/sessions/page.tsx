"use client";

import { useAuth } from "@/context/AuthContext";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useSessionMutations } from "@/hooks/sessions/use-session-mutations";
import SessionsList from "@/components/sessions/sessions-list";
import { MessageSquare, Loader2, Terminal, Globe } from "lucide-react";
import { SearchTrigger } from "@/components/search/search-trigger";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { normalizePrincipalId } from "@/lib/principal-id";

export default function SessionsPage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { sessions, setSessions, isLoading } = useUserSessions(userAddress);
  const { renameSession, deleteSession } = useSessionMutations();
  const [filter, setFilter] = useState<"all" | "cli" | "web">("all");

  const filtered = useMemo(() => {
    let list = sessions;
    if (filter === "cli") list = list.filter((s) => s.initiatorType === "cli" || s.source === "cli");
    if (filter === "web") list = list.filter((s) => s.initiatorType !== "cli" && s.source !== "cli");
    return list;
  }, [sessions, filter]);

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
    if (!ok) setSessions(prev);
    return ok;
  };

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />

        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                All conversations across your agents — including CLI runs
              </p>
            </div>
            <div className="w-64">
              <SearchTrigger />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-6 pt-4 pb-2 flex items-center gap-2">
            {(["all", "web", "cli"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filter === f
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "cli" && <Terminal className="h-3 w-3" />}
                {f === "web" && <Globe className="h-3 w-3" />}
                {f === "all" && <MessageSquare className="h-3 w-3" />}
                {f === "all" ? "All sessions" : f === "cli" ? "CLI runs" : "Web sessions"}
                {f === "all" && !isLoading && (
                  <span className="ml-0.5 opacity-60">({sessions.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Start a conversation with an agent or run{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-[11px]">agc chat</code> in
                  the terminal
                </p>
              </div>
            ) : (
              <SessionsList
                sessions={filtered}
                variant="card"
                onRename={handleRename}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
