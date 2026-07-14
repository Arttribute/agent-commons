"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Bot,
  BriefcaseBusiness,
  PanelLeft,
  PanelRight,
  LibraryBig,
  Loader2,
  Wrench,
  Workflow,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./dashboard-bar";
import { SidebarAccount } from "./sidebar-account";
import { SidebarMoreMenu } from "./sidebar-more-menu";
import { SearchTrigger } from "@/components/search/search-trigger";
import SessionsList from "@/components/sessions/sessions-list";
import { useSidebar } from "@/context/SidebarContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useSessionMutations } from "@/hooks/sessions/use-session-mutations";

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  const { sessions, setSessions, isLoading } = useUserSessions(username);
  const { renameSession, deleteSession } = useSessionMutations();

  const isLockedDetailRoute = useMemo(() => {
    if (!pathname) return false;
    // Detail pages ([id] routes) collapse the sidebar; create pages keep the
    // normal expanded sidebar like the studio list pages.
    return /^\/studio\/(agents|tools|workflows|skills)\/(?!create(?:\/|$))[^/]+/.test(
      pathname,
    );
  }, [pathname]);
  const sidebarOpen = isOpen && !isLockedDetailRoute;

  const currentSessionId = useMemo(() => {
    const m =
      pathname?.match(/^\/sessions\/([^/]+)/) ??
      pathname?.match(/^\/agents\/[^/]+\/([^/]+)/);
    return m?.[1];
  }, [pathname]);

  const activeSection = useMemo(() => {
    if (!pathname) return "agents";
    if (pathname.startsWith("/studio/agents")) return "agents";
    if (pathname.startsWith("/studio/tools")) return "tools";
    if (pathname.startsWith("/studio/tasks")) return "tasks";
    if (pathname.startsWith("/studio/workflows")) return "workflows";
    if (pathname.startsWith("/library")) return "library";
    if (pathname.startsWith("/logs")) return "logs";
    if (pathname.startsWith("/spaces")) return "spaces";
    return "agents";
  }, [pathname]);

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
    <div
      className={cn(
        "h-screen bg-background border-r border-border flex flex-col transition-all duration-300",
        sidebarOpen ? "w-[260px] min-w-[260px]" : "w-[60px] min-w-[60px]"
      )}
    >
      <div className="px-3 pt-4">
        {sidebarOpen ? (
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
            {isLockedDetailRoute ? (
              <Link
                href="/studio/agents"
                aria-label="Agent Commons"
                title="Agent Commons"
              >
                <div className="rounded-full border border-border p-[1px] bg-background">
                  <span className="block h-8 w-8 overflow-hidden rounded-full border">
                    <Image
                      src="/ac-icon.svg"
                      alt="Agent Commons Logo"
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                    />
                  </span>
                </div>
              </Link>
            ) : (
              <button
                onClick={() => setIsOpen(true)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Expand sidebar"
                title="Open sidebar"
              >
                <PanelLeft className="h-5 w-5" />
              </button>
            )}
            <div className="flex flex-col items-center gap-3 mt-2">
              <SearchTrigger collapsed />
              {[
                { key: "agents",    icon: Bot,               path: "/studio/agents",    label: "Agents" },
                { key: "tools",     icon: Wrench,            path: "/studio/tools",     label: "Tools" },
                { key: "tasks",     icon: BriefcaseBusiness, path: "/studio/tasks",     label: "Tasks" },
                { key: "workflows", icon: Workflow,          path: "/studio/workflows", label: "Workflows" },
                { key: "library",   icon: LibraryBig,        path: "/library",          label: "Library" },
              ].map(({ key, icon: Icon, path, label }) => (
                <button
                  key={key}
                  className={cn(
                    "rounded-md p-1 hover:bg-accent text-muted-foreground hover:text-foreground",
                    activeSection === key && "bg-accent text-accent-foreground"
                  )}
                  aria-label={label}
                  title={label}
                  onClick={() => router.push(path)}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
              <SidebarMoreMenu collapsed activeSection={activeSection} />
            </div>
          </div>
        )}
      </div>

      {/* Sessions — only when expanded */}
      {sidebarOpen && (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-5 px-3">
          {/* Label */}
          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Recents
            </span>
            {isLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-1 py-1 px-2">
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
              />
            )}
          </ScrollArea>
        </div>
      )}

      {/* Account — pinned to bottom */}
      <div
        className={cn(
          "mt-auto border-t border-border",
          sidebarOpen ? "p-2" : "flex justify-center px-1.5 py-2"
        )}
      >
        <SidebarAccount collapsed={!sidebarOpen} />
      </div>
    </div>
  );
}
