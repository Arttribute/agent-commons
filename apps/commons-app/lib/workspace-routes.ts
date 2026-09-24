export type WorkspaceSection =
  | "agents" | "tools" | "tasks" | "workflows" | "skills"
  | "knowledge" | "library" | "customize" | "sessions" | "settings" | "apps" | "logs" | "spaces" | "developers";

export const workspacePaths: Record<WorkspaceSection, string> = {
  agents: "/studio/agents",
  tools: "/studio/tools",
  tasks: "/studio/tasks",
  workflows: "/studio/workflows",
  skills: "/studio/skills",
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

export function resolveWorkspaceRoute(path: string): {
  section: WorkspaceSection;
  id?: string;
  isDetail: boolean;
} {
  const url = new URL(path || "/studio/agents", "https://commons.invalid");
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "studio") {
    if (segments[1] === "customize") return { section: "customize", isDetail: segments.length > 3 };
    const section = segments[1] as WorkspaceSection;
    if (["agents", "tools", "tasks", "workflows", "skills"].includes(section)) {
      return { section, id: segments[2] && segments[2] !== "create" ? decodeURIComponent(segments[2]) : undefined, isDetail: segments.length > 2 && segments[2] !== "create" };
    }
  }
  if (segments[0] === "library") return { section: url.searchParams.get("tab") === "apps" ? "apps" : "library", isDetail: false };
  if (segments[0] === "knowledge") return { section: "knowledge", isDetail: segments.length > 1 };
  if (segments[0] === "sessions") return { section: "sessions", id: segments[1] ? decodeURIComponent(segments[1]) : undefined, isDetail: segments.length > 1 };
  if (["settings", "logs", "spaces", "developers"].includes(segments[0])) {
    return { section: segments[0] as WorkspaceSection, isDetail: segments.length > 1 };
  }
  return { section: "agents", isDetail: false };
}

export function isLockedStudioDetailRoute(path: string): boolean {
  const route = resolveWorkspaceRoute(path);
  return route.isDetail && ["agents", "tools", "workflows", "skills"].includes(route.section);
}
