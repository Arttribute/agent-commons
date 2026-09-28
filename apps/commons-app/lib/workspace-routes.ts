export type WorkspaceSection =
  | "agents" | "tools" | "tasks" | "workflows" | "skills" | "projects"
  | "knowledge" | "library" | "customize" | "sessions" | "settings" | "apps" | "logs" | "spaces" | "developers";

export const workspacePaths: Record<WorkspaceSection, string> = {
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

/** Sections that live under Customize in the main navigation. */
export const customizeSections = new Set<WorkspaceSection>(["customize", "tools", "workflows", "skills", "apps"]);

export function resolveWorkspaceRoute(path: string): {
  section: WorkspaceSection;
  id?: string;
  isDetail: boolean;
} {
  const url = new URL(path || "/studio/agents", "https://commons.invalid");
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
