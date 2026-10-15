import type { WorkspacePreferences } from "@agent-commons/desktop-contract";

const PAGE_SIZES = new Set([5, 10, 20, 50]);

export function cloudVisiblePreferences(preferences: WorkspacePreferences): WorkspacePreferences {
  return { agentsPerPage: preferences.agentsPerPage, ...(preferences.appearance ? { appearance: preferences.appearance } : {}) };
}

export function mergeWorkspacePreferences(
  current: WorkspacePreferences,
  incoming: WorkspacePreferences | null | undefined,
  source: "cloud" | "private-local",
): WorkspacePreferences {
  if (!incoming || typeof incoming !== "object") return current;
  const next = { ...current };
  const appearance = incoming.appearance;
  if (appearance && ['light', 'dark', 'system'].includes(appearance.value) && Number.isFinite(appearance.updatedAt)
    && appearance.updatedAt > (current.appearance?.updatedAt ?? 0)) {
    next.appearance = { value: appearance.value, updatedAt: appearance.updatedAt };
  }
  const count = incoming.agentsPerPage;
  if (count && PAGE_SIZES.has(count.value) && Number.isFinite(count.updatedAt)
    && count.updatedAt > (current.agentsPerPage?.updatedAt ?? 0)) {
    next.agentsPerPage = { value: count.value, updatedAt: count.updatedAt };
  }
  if (source === "private-local") {
    const pinned = incoming.pinnedAppIds;
    if (pinned && Array.isArray(pinned.value) && Number.isFinite(pinned.updatedAt)
      && pinned.updatedAt > (current.pinnedAppIds?.updatedAt ?? 0)) {
      next.pinnedAppIds = {
        value: pinned.value.filter((id): id is string => typeof id === "string").slice(0, 200).map((id) => id.slice(0, 256)),
        updatedAt: pinned.updatedAt,
      };
    }
  }
  return next;
}
