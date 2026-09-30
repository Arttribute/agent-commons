"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Loader2,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./dashboard-bar";
import { SidebarAccount } from "./sidebar-account";
import { SidebarMoreMenu } from "./sidebar-more-menu";
import { workspaceNavigationItems } from "./workspace-navigation";
import { SearchTrigger } from "@/components/search/search-trigger";
import SessionsList from "@/components/sessions/sessions-list";
import { useSidebar } from "@/context/SidebarContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useSessionMutations } from "@/hooks/sessions/use-session-mutations";
import { projectsApi, useProjects } from "@/hooks/use-projects";
import { isLockedStudioDetailRoute, navigationSection } from "@/lib/workspace-routes";
import { WorkspaceModeSwitch } from "./workspace-mode-switch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

/** Routes where the sidebar starts collapsed to give the page room. */
function isFocusRoute(pathname: string) {
  return pathname.startsWith("/knowledge");
}

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen } = useSidebar();
  const pathname = usePathname() ?? "/studio/agents";
  const router = useRouter();
  const [desktop, setDesktop] = useState(false);
  const { mode, setMode } = useWorkspaceMode();
  useEffect(() => { setDesktop(Boolean(window.agentCommonsDesktop)); }, []);

  const { sessions, setSessions, isLoading, error, refetch } =
    useUserSessions(username);
  const { renameSession, deleteSession } = useSessionMutations();
  const { projects } = useProjects(Boolean(username));
  const [focusExpanded, setFocusExpanded] = useState(false);

  const isLockedDetailRoute = isLockedStudioDetailRoute(pathname);
  const focusRoute = isFocusRoute(pathname);
  useEffect(() => { setFocusExpanded(false); }, [pathname]);
  const sidebarOpen = isLockedDetailRoute ? false : focusRoute ? focusExpanded : isOpen;
  const setOpen = (open: boolean) => (focusRoute ? setFocusExpanded(open) : setIsOpen(open));

  const currentSessionId = useMemo(() => pathname.match(/^\/sessions\/([^/]+)/)?.[1], [pathname]);

  const activeSection = navigationSection(pathname);
  const projectOptions = useMemo(() => projects.map(({ projectId, name }) => ({ projectId, name })), [projects]);
  const recents = useMemo(() => sessions.filter((session) => !session.projectId), [sessions]);

  const handleRename = async (sessionId: string, title: string) => {
    const prev = sessions;
    setSessions((list) => list.map((s) => (s.sessionId === sessionId ? { ...s, title } : s)));
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

  const handleMove = async (sessionId: string, projectId: string | null) => {
    const prev = sessions;
    setSessions((list) => list.map((s) => (s.sessionId === sessionId ? { ...s, projectId } : s)));
    try {
      await projectsApi.moveSession(sessionId, projectId);
    } catch {
      setSessions(prev);
    }
  };

  return (
    <div
      className={cn(
        "flex h-screen flex-col border-r border-border bg-white transition-all duration-300",
        sidebarOpen ? "w-[290px] min-w-[290px]" : "w-[60px] min-w-[60px]",
      )}
    >
      <div className="px-3 pt-4">
        {sidebarOpen ? (
          <DashboardBar
            activeTab={activeSection}
            rightSlot={
              <button
                aria-label="Collapse sidebar"
                className="ml-2 text-foreground/70 hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-4 px-2">
            {isLockedDetailRoute ? (
              <Link href="/studio/agents" aria-label="Agent Commons" title="Agent Commons">
                <div className="rounded-full border border-border bg-background p-[1px]">
                  <span className="block h-6 w-6 overflow-hidden rounded-full border">
                    <Image src="/ac-icon.svg" alt="Agent Commons Logo" width={24} height={24} className="h-full w-full object-cover" />
                  </span>
                </div>
              </Link>
            ) : (
              <button
                onClick={() => setOpen(true)}
                className="text-foreground/70 hover:text-foreground"
                aria-label="Expand sidebar"
                title="Open sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
            <div className="mt-2 flex flex-col items-center gap-3">
              <SearchTrigger collapsed />
              {workspaceNavigationItems.map(({ key, icon: Icon, path, label }) => (
                <button
                  key={key}
                  className={cn(
                    "rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground",
                    activeSection === key && "bg-accent text-accent-foreground",
                  )}
                  aria-label={label}
                  title={label}
                  onClick={() => router.push(path)}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </button>
              ))}
              <SidebarMoreMenu collapsed activeSection={activeSection} />
            </div>
          </div>
        )}
      </div>

      {sidebarOpen && (
        <ScrollArea className="mt-4 min-h-0 flex-1 px-3">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">Recents</span>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {isLoading && !sessions.length ? (
            <div className="space-y-1 px-2 py-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : error ? (
            <button
              type="button"
              className="mx-2 my-3 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={refetch}
            >
              Retry sessions
            </button>
          ) : (
            <div className="pb-3">
              <SessionsList
                sessions={recents}
                currentSessionId={currentSessionId}
                onRename={handleRename}
                onDelete={handleDelete}
                projects={projectOptions}
                onMoveToProject={handleMove}
              />
            </div>
          )}
        </ScrollArea>
      )}

      <div
        className={cn(
          "mt-auto border-t border-border",
          sidebarOpen ? "space-y-1.5 p-2" : "flex flex-col items-center gap-1.5 px-1.5 py-2",
        )}
      >
        {desktop && (
          <div className={cn(sidebarOpen && "px-1")}>
            <WorkspaceModeSwitch
              mode={mode}
              collapsed={!sidebarOpen}
              onCloud={() => void setMode("cloud")}
              onLocal={() => void setMode("private-local")}
            />
          </div>
        )}
        <SidebarAccount collapsed={!sidebarOpen} />
      </div>

    </div>
  );
}
