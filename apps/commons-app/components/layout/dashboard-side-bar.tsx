"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Loader2,
  Menu,
  PanelLeft,
  PanelRight,
  SquarePen,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DashboardBar } from "./dashboard-bar";
import { SidebarAccount } from "./sidebar-account";
import { SidebarMoreMenu } from "./sidebar-more-menu";
import { workspaceNavigationItems } from "./workspace-navigation";
import { SearchTrigger } from "@/components/search/search-trigger";
import { NewChatButton } from "./new-chat-button";
import SessionsList from "@/components/sessions/sessions-list";
import { useSidebar } from "@/context/SidebarContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useSessionMutations } from "@/hooks/sessions/use-session-mutations";
import { projectsApi, useProjects } from "@/hooks/use-projects";
import { hasOwnMobileHeader, isAgentsChatRoute, isLockedStudioDetailRoute, navigationSection } from "@/lib/workspace-routes";
import { WorkspaceModeSwitch } from "./workspace-mode-switch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { hasSecondaryNav, useSecondaryNav } from "@/stores/secondary-nav-store";

/** Routes where the sidebar starts collapsed to give the page room. */
function isFocusRoute(pathname: string) {
  return pathname.startsWith("/knowledge");
}

export function DashboardSideBar({ username }: { username: string }) {
  const { isOpen, setIsOpen, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname() ?? "/new";
  // Phones get a top bar and a full-screen menu instead of the side rail.
  const ownMobileHeader = hasOwnMobileHeader(pathname);
  useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);
  const router = useRouter();
  const [desktop, setDesktop] = useState(false);
  const { mode, setMode } = useWorkspaceMode();
  useEffect(() => { setDesktop(Boolean(window.agentCommonsDesktop)); }, []);

  const { sessions, setSessions, isLoading, error, refetch } =
    useUserSessions(username);
  const { renameSession, deleteSession } = useSessionMutations();
  const { projects } = useProjects(Boolean(username));
  const [focusExpanded, setFocusExpanded] = useState(false);

  // Detail views, Knowledge and the agents chat app (which brings its own
  // list) start with the sidebar as a rail; it can still be opened.
  const focusRoute = isFocusRoute(pathname) || isLockedStudioDetailRoute(pathname) || isAgentsChatRoute(pathname);
  // Library files and projects show their own list; the main sidebar stays a
  // rail beside it, and opening one closes the other.
  const secondaryRoute = hasSecondaryNav(pathname);
  const mainExpanded = useSecondaryNav((state) => state.mainExpanded);
  const setMainExpanded = useSecondaryNav((state) => state.setMainExpanded);
  useEffect(() => { setFocusExpanded(false); }, [pathname]);
  useEffect(() => { if (secondaryRoute) setMainExpanded(false); }, [pathname, secondaryRoute, setMainExpanded]);
  const sidebarOpen = secondaryRoute
    ? mainExpanded
    : focusRoute
      ? focusExpanded
      : isOpen;
  const setOpen = (open: boolean) =>
    secondaryRoute ? setMainExpanded(open) : focusRoute ? setFocusExpanded(open) : setIsOpen(open);

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

  const recentsPane = (
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
  );

  const footer = (collapsed: boolean) => (
    <div
      className={cn(
        "mt-auto border-t border-border",
        collapsed ? "flex flex-col items-center gap-1.5 px-1.5 py-2" : "space-y-1.5 p-2",
      )}
    >
      {desktop && (
        <div className={cn(!collapsed && "px-1")}>
          <WorkspaceModeSwitch
            mode={mode}
            collapsed={collapsed}
            onCloud={() => void setMode("cloud")}
            onLocal={() => void setMode("private-local")}
          />
        </div>
      )}
      <SidebarAccount collapsed={collapsed} />
    </div>
  );

  return (
    <>
      {!ownMobileHeader && <MobileTopBar />}
      <MobileNavDrawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <div
          className="px-3 pt-4"
          onClickCapture={(event) => {
            // Choosing a destination closes the menu, even when it is the current page.
            const target = (event.target as HTMLElement).closest("a, [data-workspace-navigation] button:not([aria-haspopup])");
            if (target) setMobileOpen(false);
          }}
        >
          <DashboardBar
            activeTab={activeSection}
            rightSlot={
              <>
                <SearchTrigger collapsed />
                <DialogPrimitive.Close
                  aria-label="Close menu"
                  className="rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </DialogPrimitive.Close>
              </>
            }
          />
        </div>
        {recentsPane}
        {footer(false)}
      </MobileNavDrawer>
      <div
        className={cn(
          "hidden h-full flex-col border-r border-border bg-white transition-all duration-300 md:flex",
          sidebarOpen ? "w-[290px] min-w-[290px]" : "w-[60px] min-w-[60px]",
        )}
      >
        <div className="px-3 pt-4">
          {sidebarOpen ? (
            <DashboardBar
              activeTab={activeSection}
              rightSlot={
                <>
                  <SearchTrigger collapsed />
                  <button
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                    className="rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground"
                    onClick={() => setOpen(false)}
                  >
                    <PanelRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </>
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-2">
              <button
                onClick={() => setOpen(true)}
                className="rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground"
                aria-label="Expand sidebar"
                title="Open sidebar"
              >
                <PanelLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <div className="mt-2 flex flex-col items-center gap-3">
                <NewChatButton collapsed active={activeSection === "new"} />
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

        {sidebarOpen && recentsPane}

        {footer(!sidebarOpen)}
      </div>
    </>
  );
}

/** Phone-only button that opens the full-screen navigation menu. */
export function MobileMenuButton({ className }: { className?: string }) {
  const { setMobileOpen } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Open menu"
      onClick={() => setMobileOpen(true)}
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/80 hover:bg-muted md:hidden", className)}
    >
      <Menu className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}

/** The default phone header for pages that do not bring their own. */
function MobileTopBar() {
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 bg-white px-2 md:hidden">
      <MobileMenuButton />
      <Link href="/new" aria-label="Agent Commons" className="flex min-w-0 flex-1 items-center">
        <Image src="/logo.jpg" alt="Agent Commons" width={131} height={60} className="h-7 w-auto rounded-md object-contain" />
      </Link>
      <Link
        href="/new"
        aria-label="New chat"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground/80 hover:bg-muted"
      >
        <SquarePen className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

/** Full-screen navigation for phones. It slides in from the left. */
function MobileNavDrawer({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 z-[80] flex h-app flex-col bg-white pt-[env(safe-area-inset-top)] pb-safe duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left motion-reduce:animate-none md:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
