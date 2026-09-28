"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  Loader2,
  PanelLeft,
  PanelRight,
  Plus,
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
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";

const PROJECTS_SHOWN = 5;
const OPEN_PROJECTS_KEY = "commons.sidebarProjectsOpen";

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
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [focusExpanded, setFocusExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPEN_PROJECTS_KEY);
      if (saved !== null) setProjectsOpen(saved === "true");
    } catch { /* Default open. */ }
  }, []);
  const toggleProjects = () => {
    setProjectsOpen((open) => {
      try { localStorage.setItem(OPEN_PROJECTS_KEY, String(!open)); } catch { /* Per-viewer only. */ }
      return !open;
    });
  };

  const isLockedDetailRoute = isLockedStudioDetailRoute(pathname);
  const focusRoute = isFocusRoute(pathname);
  useEffect(() => { setFocusExpanded(false); }, [pathname]);
  const sidebarOpen = isLockedDetailRoute ? false : focusRoute ? focusExpanded : isOpen;
  const setOpen = (open: boolean) => (focusRoute ? setFocusExpanded(open) : setIsOpen(open));

  const currentSessionId = useMemo(() => pathname.match(/^\/sessions\/([^/]+)/)?.[1], [pathname]);
  const currentProjectId = useMemo(() => {
    const direct = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    if (direct) return decodeURIComponent(direct);
    return sessions.find((session) => session.sessionId === currentSessionId)?.projectId ?? undefined;
  }, [pathname, sessions, currentSessionId]);

  const activeSection = navigationSection(pathname);
  const projectOptions = useMemo(() => projects.map(({ projectId, name }) => ({ projectId, name })), [projects]);
  const recents = useMemo(() => sessions.filter((session) => !session.projectId), [sessions]);
  const shownProjects = useMemo(() => {
    const first = projects.slice(0, PROJECTS_SHOWN);
    const current = projects.find((project) => project.projectId === currentProjectId);
    return current && !first.includes(current) ? [...first, current] : first;
  }, [projects, currentProjectId]);

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
          <section aria-label="Projects" className="mb-3">
            <div className="group flex items-center justify-between px-2 py-1">
              <button
                type="button"
                onClick={toggleProjects}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-expanded={projectsOpen}
              >
                Projects
                {projectsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="New project"
                title="New project"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {projectsOpen && (
              <div className="space-y-0.5">
                {shownProjects.map((project) => {
                  const active = project.projectId === currentProjectId;
                  const projectChats = active
                    ? sessions.filter((session) => session.projectId === project.projectId).slice(0, 6)
                    : [];
                  const Icon = active ? FolderOpen : FolderClosed;
                  return (
                    <div key={project.projectId}>
                      <Link
                        href={`/projects/${encodeURIComponent(project.projectId)}`}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                          active && pathname.startsWith("/projects/") ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-accent/60",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-foreground/60" strokeWidth={1.75} />
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      </Link>
                      {projectChats.length > 0 && (
                        <div className="ml-[15px] border-l border-border pl-2">
                          <SessionsList
                            sessions={projectChats}
                            currentSessionId={currentSessionId}
                            onRename={handleRename}
                            onDelete={handleDelete}
                            projects={projectOptions}
                            onMoveToProject={handleMove}
                            nested
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!projects.length && (
                  <button
                    type="button"
                    onClick={() => setCreateProjectOpen(true)}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.75} />
                    New project
                  </button>
                )}
                {projects.length > PROJECTS_SHOWN && (
                  <Link href="/projects" className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                    All projects
                  </Link>
                )}
              </div>
            )}
          </section>

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

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(project) => router.push(`/projects/${encodeURIComponent(project.projectId)}`)}
      />
    </div>
  );
}
