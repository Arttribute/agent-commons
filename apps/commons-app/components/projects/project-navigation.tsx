"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, FolderClosed, FolderOpen, LayoutGrid, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { projectsApi, useProjects } from "@/hooks/use-projects";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";
import { useSecondaryNav } from "@/stores/secondary-nav-store";
import { cn } from "@/lib/utils";

type ProjectChat = Awaited<ReturnType<typeof projectsApi.sessions>>[number];

/** Project navigation lives beside the project workspace, like Knowledge. */
export function ProjectNavigation() {
  const pathname = usePathname() ?? "";
  const { projects } = useProjects();
  const open = useSecondaryNav((state) => state.open);
  const setOpen = useSecondaryNav((state) => state.setOpen);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [chats, setChats] = useState<Record<string, ProjectChat[] | "loading">>({});
  const onProject = /^\/projects\/[^/]+/.test(pathname);
  const currentId = onProject ? decodeURIComponent(pathname.split("/")[2] ?? "") : "";
  const currentSession = pathname.match(/^\/sessions\/([^/]+)/)?.[1];

  const loadChats = (projectId: string) => {
    setChats((current) => ({ ...current, [projectId]: current[projectId] && current[projectId] !== "loading" ? current[projectId] : "loading" }));
    void projectsApi
      .sessions(projectId)
      .then((list) => setChats((current) => ({ ...current, [projectId]: list })))
      .catch(() => setChats((current) => ({ ...current, [projectId]: [] })));
  };

  // Keep open folders current when chats change elsewhere.
  useEffect(() => {
    const refresh = () => expanded.forEach((projectId) => loadChats(projectId));
    window.addEventListener(SESSIONS_CHANGED, refresh);
    return () => window.removeEventListener(SESSIONS_CHANGED, refresh);
  }, [expanded]);

  if (!onProject || !open) return null;

  const toggle = (projectId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else {
        next.add(projectId);
        loadChats(projectId);
      }
      return next;
    });
  };

  return (
    <nav aria-label="Projects" className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <Link
          href="/projects"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">All projects</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide projects"
          title="Hide projects"
          className="rounded-md p-1.5 text-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 pb-3">
        {projects.map((project) => {
          const isOpen = expanded.has(project.projectId);
          const active = project.projectId === currentId;
          const list = chats[project.projectId];
          return (
            <li key={project.projectId}>
              <div
                className={cn(
                  "group flex items-center rounded-md text-sm",
                  active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(project.projectId)}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Hide chats in ${project.name}` : `Show chats in ${project.name}`}
                  className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  {isOpen ? (
                    <FolderOpen className="h-4 w-4 group-hover:hidden" strokeWidth={1.75} />
                  ) : (
                    <FolderClosed className="h-4 w-4 group-hover:hidden" strokeWidth={1.75} />
                  )}
                  <ChevronRight className={cn("hidden h-3.5 w-3.5 transition-transform group-hover:block", isOpen && "rotate-90")} />
                </button>
                <Link
                  href={`/projects/${encodeURIComponent(project.projectId)}`}
                  title={project.name}
                  aria-current={active ? "page" : undefined}
                  className={cn("min-w-0 flex-1 truncate py-1.5 pr-2", active && "font-medium")}
                >
                  {project.name}
                </Link>
              </div>
              {isOpen && (
                <ul className="ml-[22px] border-l border-border pl-2">
                  {list === "loading" || list === undefined ? (
                    <li className="flex py-1.5 pl-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </li>
                  ) : list.length ? (
                    list.map((chat) => (
                      <li key={chat.sessionId}>
                        <Link
                          href={`/sessions/${encodeURIComponent(chat.sessionId)}`}
                          aria-current={chat.sessionId === currentSession ? "page" : undefined}
                          className={cn(
                            "block truncate rounded-md px-2 py-1 text-[13px] text-foreground/75 hover:bg-muted hover:text-foreground",
                            chat.sessionId === currentSession && "bg-accent text-accent-foreground",
                          )}
                        >
                          {chat.title && chat.title !== "New chat" ? chat.title : "Untitled chat"}
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li className="px-2 py-1 text-xs text-muted-foreground">No chats yet</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Brings the projects list back after it was hidden. */
export function ProjectNavigationToggle() {
  const open = useSecondaryNav((state) => state.open);
  const setOpen = useSecondaryNav((state) => state.setOpen);
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Show projects"
      title="Show projects"
      className="hidden rounded-md p-1.5 text-foreground/60 hover:bg-muted hover:text-foreground md:inline-flex"
    >
      <PanelLeftOpen className="h-4 w-4" />
    </button>
  );
}
