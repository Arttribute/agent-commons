"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PanelLeft,
  PanelRight,
  Sparkles,
  Earth,
  Folder,
  Search,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./dashboard-bar";
import { useSidebar } from "@/context/SidebarContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { formatDistanceToNow } from "date-fns";

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { sessions, isLoading } = useUserSessions(username);

  const activeSection = useMemo(() => {
    if (!pathname) return "studio";
    if (pathname.startsWith("/studio")) return "studio";
    if (pathname.startsWith("/spaces")) return "spaces";
    if (pathname.startsWith("/files")) return "files";
    return "studio";
  }, [pathname]);

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    return sessions.filter((s) =>
      (s.title || "New session").toLowerCase().includes(search.toLowerCase())
    );
  }, [sessions, search]);

  return (
    <div
      className={cn(
        "h-[calc(100vh-50px)] bg-background border-r border-border flex flex-col transition-all duration-300",
        isOpen ? "w-[260px] min-w-[260px]" : "w-[60px] min-w-[60px]"
      )}
    >
      <div className="px-3 pt-4">
        {isOpen ? (
          <div>
            <DashboardBar
              activeTab={activeSection}
              rightSlot={
                <button
                  aria-label="Collapse sidebar"
                  className="ml-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <PanelRight className="h-5 w-5" />
                </button>
              }
            />
          </div>
        ) : (
          <div className="px-2 flex flex-col gap-4 items-center">
            <button
              onClick={() => setIsOpen(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Expand sidebar"
              title="Open sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-3 mt-2">
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "studio" && "bg-accent text-accent-foreground"
                )}
                aria-label="Studio"
                title="Studio"
                onClick={() => router.push("/studio/agents")}
              >
                <Sparkles className="h-5 w-5" />
              </button>
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "spaces" && "bg-accent text-accent-foreground"
                )}
                aria-label="Spaces"
                title="Spaces"
                onClick={() => router.push("/spaces")}
              >
                <Earth className="h-5 w-5" />
              </button>
              <button
                className={cn(
                  "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                  activeSection === "files" && "bg-accent text-accent-foreground"
                )}
                aria-label="Files"
                title="Files"
                onClick={() => router.push("/files")}
              >
                <Folder className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sessions list — only when expanded */}
      {isOpen && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-4">
          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions..."
                className="h-7 pl-7 text-xs bg-muted/50 border-0 focus-visible:ring-1"
              />
            </div>
          </div>

          {/* Label */}
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Recent Sessions
            </span>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>

          <ScrollArea className="flex-1 px-2">
            {isLoading ? (
              <div className="space-y-1 px-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-9 rounded-md bg-muted animate-pulse"
                    style={{ opacity: 1 - i * 0.15 }}
                  />
                ))}
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="py-6 text-center">
                <MessageSquare className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No sessions yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredSessions.map((session) => {
                  const isActive = pathname?.includes(session.sessionId);
                  const timeAgo = session.createdAt
                    ? formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })
                    : null;
                  return (
                    <Link
                      key={session.sessionId}
                      href={`/agents/${session.agentId}/${session.sessionId}`}
                    >
                      <div
                        className={cn(
                          "group px-2 py-2 rounded-md cursor-pointer transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <p className="text-sm truncate font-medium leading-tight">
                          {session.title || "New session"}
                        </p>
                        {timeAgo && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {timeAgo}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
