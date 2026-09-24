"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { isUiPlugin, type UiPlugin } from "@/components/plugins/types";
import { subscribeToUiPluginChanges } from "@/lib/ui-plugin-events";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";

export const GLOBAL_APPS_SCOPE = "global";
export const DEFAULT_MAX_PINNED_APPS = 6;

type CommonsAppsState = {
  plugins: UiPlugin[];
  layout: Record<string, string[]>;
  maxPinned: number;
  loaded: boolean;
  refresh: () => Promise<void>;
  setPins: (scope: string, pluginIds: string[]) => Promise<void>;
  resetScope: (scope: string) => Promise<void>;
  replacePlugin: (plugin: UiPlugin) => void;
  /** Open app windows in the order they were opened (stable render order). */
  openWindows: string[];
  /** Stacking order of open windows, last item on top. */
  windowStack: string[];
  toggleWindow: (pluginId: string) => void;
  focusWindow: (pluginId: string) => void;
  closeWindow: (pluginId: string) => void;
};

let refreshSequence = 0;

export const useCommonsAppsStore = create<CommonsAppsState>((set, get) => ({
  plugins: [],
  layout: {},
  maxPinned: DEFAULT_MAX_PINNED_APPS,
  loaded: false,

  refresh: async () => {
    const sequence = ++refreshSequence;
    const local = typeof document !== "undefined" && document.cookie.split(";").some((part) => part.trim() === "commons-desktop-mode=private-local");
    if (local) set({ plugins: [], loaded: false });
    try {
      const [pluginsResponse, layoutResponse] = await Promise.all([
        desktopApiFetch("/api/ui-plugins", { cache: "no-store" }),
        desktopApiFetch("/api/ui-plugins/layout", { cache: "no-store" }),
      ]);
      if (sequence !== refreshSequence) return;
      const pluginsPayload = pluginsResponse.ok
        ? await pluginsResponse.json().catch(() => null)
        : null;
      const layoutPayload = layoutResponse.ok
        ? await layoutResponse.json().catch(() => null)
        : null;
      if (sequence !== refreshSequence) return;
      set({
        ...(Array.isArray(pluginsPayload?.data)
          ? { plugins: pluginsPayload.data.filter(isUiPlugin) }
          : {}),
        ...(layoutPayload?.data?.scopes
          ? {
              layout: layoutPayload.data.scopes,
              maxPinned:
                layoutPayload.data.maxPinned ?? DEFAULT_MAX_PINNED_APPS,
            }
          : {}),
        loaded: true,
      });
    } catch {
      // Keep the last known apps during transient failures.
      set(local ? { plugins: [], loaded: true } : { loaded: true });
    }
  },

  setPins: async (scope, pluginIds) => {
    const previous = get().layout;
    const ids = pluginIds.slice(0, get().maxPinned);
    set({ layout: { ...previous, [scope]: ids } });
    try {
      const response = await desktopApiFetch("/api/ui-plugins/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, pluginIds: ids }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not pin");
      if (payload?.data?.scopes) set({ layout: payload.data.scopes });
    } catch (error) {
      set({ layout: previous });
      throw error;
    }
  },

  resetScope: async (scope) => {
    const previous = get().layout;
    const next = { ...previous };
    delete next[scope];
    set({ layout: next });
    try {
      const response = await desktopApiFetch(
        `/api/ui-plugins/layout?scope=${encodeURIComponent(scope)}`,
        { method: "DELETE" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Could not reset");
      if (payload?.data?.scopes) set({ layout: payload.data.scopes });
    } catch (error) {
      set({ layout: previous });
      throw error;
    }
  },

  openWindows: [],
  windowStack: [],
  toggleWindow: (pluginId) =>
    set((state) =>
      state.openWindows.includes(pluginId)
        ? {
            openWindows: state.openWindows.filter((id) => id !== pluginId),
            windowStack: state.windowStack.filter((id) => id !== pluginId),
          }
        : {
            openWindows: [...state.openWindows, pluginId],
            windowStack: [...state.windowStack, pluginId],
          },
    ),
  // Only the stack changes: moving an iframe in the DOM would reload the app.
  focusWindow: (pluginId) =>
    set((state) =>
      !state.openWindows.includes(pluginId) ||
      state.windowStack[state.windowStack.length - 1] === pluginId
        ? state
        : {
            windowStack: [
              ...state.windowStack.filter((id) => id !== pluginId),
              pluginId,
            ],
          },
    ),
  closeWindow: (pluginId) =>
    set((state) => ({
      openWindows: state.openWindows.filter((id) => id !== pluginId),
      windowStack: state.windowStack.filter((id) => id !== pluginId),
    })),

  replacePlugin: (plugin) =>
    set((state) => ({
      plugins: state.plugins.some((item) => item.pluginId === plugin.pluginId)
        ? state.plugins.map((item) =>
            item.pluginId === plugin.pluginId ? plugin : item,
          )
        : [plugin, ...state.plugins],
    })),
}));

let subscribers = 0;
let teardown: (() => void) | null = null;

/** Loads apps once and keeps them fresh while any consumer is mounted. */
export function useCommonsApps() {
  const state = useCommonsAppsStore();

  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) {
      const { refresh } = useCommonsAppsStore.getState();
      void refresh();
      const unsubscribe = subscribeToUiPluginChanges(() => void refresh());
      const onFocus = () => void refresh();
      const interval = window.setInterval(() => void refresh(), 60_000);
      window.addEventListener("focus", onFocus);
      teardown = () => {
        unsubscribe();
        window.clearInterval(interval);
        window.removeEventListener("focus", onFocus);
      };
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        teardown?.();
        teardown = null;
      }
    };
  }, []);

  return state;
}

/**
 * Pins can differ per page. A scope is the first path segment, plus the tab
 * for Studio (for example `studio/tasks`), so related pages share pins.
 */
export function appsScopeForPath(pathname: string | null) {
  const segments = (pathname ?? "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const first = segments[0];
  if (!first || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(first)) return "home";
  if (
    first === "studio" &&
    segments[1] &&
    /^[a-z0-9][a-z0-9_-]{0,39}$/.test(segments[1])
  ) {
    return `studio/${segments[1]}`;
  }
  return first;
}

export function appsScopeLabel(scope: string) {
  if (scope === GLOBAL_APPS_SCOPE) return "All pages";
  return scope
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" › ");
}

/** The pins in effect for a page: its own list, or the global list. */
export function resolvePins(
  layout: Record<string, string[]>,
  scope: string,
  plugins: UiPlugin[],
) {
  const hasOwn = Object.prototype.hasOwnProperty.call(layout, scope);
  const ids = (hasOwn ? layout[scope] : layout[GLOBAL_APPS_SCOPE]) ?? [];
  const active = new Map(
    plugins
      .filter((plugin) => plugin.status === "active")
      .map((plugin) => [plugin.pluginId, plugin]),
  );
  return {
    customized: hasOwn,
    pinned: ids
      .map((id) => active.get(id))
      .filter((plugin): plugin is UiPlugin => Boolean(plugin)),
  };
}
