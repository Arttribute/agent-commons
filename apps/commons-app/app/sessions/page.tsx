"use client";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  MessageSquare,
  Loader2,
  Search,
  Terminal,
  Globe,
  Clock,
  Bot,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function SessionsPage() {
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const { sessions, isLoading } = useUserSessions(userAddress);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "cli" | "web">("all");

  const filtered = useMemo(() => {
    let list = sessions;
    if (filter === "cli") list = list.filter((s) => s.initiatorType === "cli" || s.source === "cli");
    if (filter === "web") list = list.filter((s) => s.initiatorType !== "cli" && s.source !== "cli");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.title || "New session").toLowerCase().includes(q) ||
          s.agentId?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sessions, filter, search]);

  return (
    <div className="min-h-screen bg-background">
      <AppBar />
      <div className="mt-12 flex">
        <DashboardSideBar username={userAddress} />

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                All conversations across your agents — including CLI runs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sessions..."
                  className="h-8 pl-8 text-sm w-64"
                />
              </div>
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
                <p className="text-sm text-muted-foreground">
                  {search ? "No sessions match your search" : "No sessions yet"}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground/60">
                    Start a conversation with an agent or run{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-[11px]">agc chat</code> in
                    the terminal
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                {filtered.map((session) => {
                  const isCli = session.initiatorType === "cli" || session.source === "cli";
                  const timeAgo = session.createdAt
                    ? formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })
                    : null;
                  return (
                    <Link
                      key={session.sessionId}
                      href={`/agents/${session.agentId}/${session.sessionId}`}
                    >
                      <div className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-foreground/20 hover:bg-accent/40 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            {isCli ? (
                              <Terminal className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Bot className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {session.title || "New session"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              Agent: {session.agentId}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          {isCli && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Terminal className="h-2.5 w-2.5" />
                              CLI
                            </Badge>
                          )}
                          {timeAgo && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {timeAgo}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
