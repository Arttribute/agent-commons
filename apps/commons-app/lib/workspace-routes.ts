export type WorkspaceSection =
  | "new" | "agents" | "tools" | "tasks" | "workflows" | "skills" | "projects"
  | "knowledge" | "library" | "customize" | "sessions" | "settings" | "apps" | "logs" | "spaces" | "developers";

export const workspacePaths: Record<WorkspaceSection, string> = {
  new: "/new",
  agents: "/studio/agents",
  projects: "/projects",
  tools: "/studio/customize/tools",
  tasks: "/studio/tasks",
  workflows: "/studio/customize/workflows",
  skills: "/studio/customize/skills",
  knowledge: "/knowledge",
  library: "/library",
  customize: "/studio/customize/apps",
  sessions: "/sessions",
  settings: "/settings",
  apps: "/library?tab=apps",
  logs: "/logs",
  spaces: "/spaces",
  developers: "/developers",
};

/** Conversations belong to a workspace. Other pages keep their exact location. */
export function workspaceModeSwitchPath(path?: string): string {
  if (!path?.startsWith("/") || path.startsWith("//")) return "/new";
  try {
    const url = new URL(path, "https://commons.invalid");
    if (url.origin !== "https://commons.invalid") return "/new";
    if (/^\/sessions\/[^/]+/.test(url.pathname)) return "/new";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/new";
  }
}

/** Sections that live under Customize in the main navigation. */
export const customizeSections = new Set<WorkspaceSection>(["customize", "tools", "workflows", "skills", "apps"]);

export function resolveWorkspaceRoute(path: string): {
  section: WorkspaceSection;
  id?: string;
  isDetail: boolean;
} {
  const url = new URL(path || "/new", "https://commons.invalid");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "studio") {
    if (segments[1] === "customize") {
      const tab = segments[2] as WorkspaceSection | undefined;
      if (tab && ["tools", "workflows", "skills"].includes(tab)) {
        return { section: tab, id: segments[3] ? decodeURIComponent(segments[3]) : undefined, isDetail: segments.length > 3 };
      }
      return { section: "customize", isDetail: segments.length > 3 };
    }
    const section = segments[1] as WorkspaceSection;
    if (["agents", "tools", "tasks", "workflows", "skills"].includes(section)) {
      return { section, id: segments[2] && segments[2] !== "create" ? decodeURIComponent(segments[2]) : undefined, isDetail: segments.length > 2 && segments[2] !== "create" };
    }
  }
  if (segments[0] === "new") return { section: "new", isDetail: false };
  if (segments[0] === "projects") {
    return { section: "projects", id: segments[1] ? decodeURIComponent(segments[1]) : undefined, isDetail: segments.length > 1 };
  }
  if (segments[0] === "library") return { section: url.searchParams.get("tab") === "apps" ? "apps" : "library", isDetail: false };
  if (segments[0] === "knowledge") return { section: "knowledge", isDetail: segments.length > 1 };
  if (segments[0] === "sessions") return { section: "sessions", id: segments[1] ? decodeURIComponent(segments[1]) : undefined, isDetail: segments.length > 1 };
  if (segments[0] === "apps") return { section: "apps", isDetail: segments.length > 1 };
  if (["settings", "logs", "spaces", "developers"].includes(segments[0])) {
    return { section: segments[0] as WorkspaceSection, isDetail: segments.length > 1 };
  }
  return { section: "agents", isDetail: false };
}

/** The main navigation entry that should appear active for a route. */
export function navigationSection(path: string) {
  const { section } = resolveWorkspaceRoute(path);
  if (section === "sessions") return "agents";
  if (customizeSections.has(section)) return "customize";
  return section;
}

export function isLockedStudioDetailRoute(path: string): boolean {
  const route = resolveWorkspaceRoute(path);
  return route.isDetail && ["agents", "tools", "workflows", "skills"].includes(route.section);
}

/** The agents chat app, where the agent list sits beside the main sidebar rail. */
export function isAgentsChatRoute(path: string): boolean {
  return /^\/studio\/agents(\/|$|\?)/.test(path);
}

/** Pages that put the phone menu button in their own header instead of the default top bar. */
export function hasOwnMobileHeader(path: string): boolean {
  return path === "/new" || isAgentsChatRoute(path) || /^\/sessions\/[^/]+/.test(path);
}
