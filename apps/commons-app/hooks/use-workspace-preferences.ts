"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspacePreferences } from "@agent-commons/desktop-contract";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

const STORAGE_KEY = "agc:workspace-preferences:v1";
const LEGACY_AGENT_COUNT = "studio-agents-per-page";
const CHANGE_EVENT = "agc:workspace-preferences-changed";
const PAGE_SIZES = [5, 10, 20, 50] as const;
type PageSize = typeof PAGE_SIZES[number];

function readBrowser(): WorkspacePreferences {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as WorkspacePreferences;
    if (saved.agentsPerPage || saved.pinnedAppIds) return saved;
  } catch { /* An invalid old value should not hide the workspace. */ }
  const legacy = Number(window.localStorage.getItem(LEGACY_AGENT_COUNT));
  return PAGE_SIZES.includes(legacy as PageSize)
    ? { agentsPerPage: { value: legacy as PageSize, updatedAt: 1 } }
    : {};
}

function merge(a: WorkspacePreferences, b: WorkspacePreferences): WorkspacePreferences {
  return {
    agentsPerPage: (b.agentsPerPage?.updatedAt ?? 0) > (a.agentsPerPage?.updatedAt ?? 0) ? b.agentsPerPage : a.agentsPerPage,
    pinnedAppIds: (b.pinnedAppIds?.updatedAt ?? 0) > (a.pinnedAppIds?.updatedAt ?? 0) ? b.pinnedAppIds : a.pinnedAppIds,
  };
}

function writeBrowser(preferences: WorkspacePreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  if (preferences.agentsPerPage) window.localStorage.setItem(LEGACY_AGENT_COUNT, String(preferences.agentsPerPage.value));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: preferences }));
}

export function useWorkspacePreferences() {
  const { mode } = useWorkspaceMode();
  const [preferences, setPreferences] = useState<WorkspacePreferences>({});

  useEffect(() => {
    const bridge = mode === "private-local" ? window.agentCommonsLocal : window.agentCommonsDesktop;
    const browser = readBrowser();
    setPreferences(browser);
    let active = true;
    const receive = (incoming: WorkspacePreferences) => {
      if (!active) return;
      const combined = merge(readBrowser(), incoming);
      writeBrowser(combined);
      setPreferences(combined);
    };
    const offBridge = bridge?.onPreferences(receive);
    const onBrowser = (event: Event) => setPreferences((event as CustomEvent<WorkspacePreferences>).detail);
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) setPreferences(readBrowser()); };
    window.addEventListener(CHANGE_EVENT, onBrowser);
    window.addEventListener("storage", onStorage);
    if (bridge) {
      void bridge.getPreferences().then((remote) => {
        if (!active) return;
        const combined = merge(remote, browser);
        writeBrowser(combined);
        setPreferences(combined);
        return bridge.syncPreferences(combined);
      }).then((merged) => { if (merged) receive(merged); }).catch(() => undefined);
    }
    return () => {
      active = false;
      offBridge?.();
      window.removeEventListener(CHANGE_EVENT, onBrowser);
      window.removeEventListener("storage", onStorage);
    };
  }, [mode]);

  const update = useCallback((patch: WorkspacePreferences) => {
    const next = merge(readBrowser(), patch);
    writeBrowser(next);
    setPreferences(next);
    const bridge = mode === "private-local" ? window.agentCommonsLocal : window.agentCommonsDesktop;
    void bridge?.syncPreferences(next).catch(() => undefined);
  }, [mode]);

  const nextTimestamp = (key: keyof WorkspacePreferences) =>
    Math.max(Date.now(), (readBrowser()[key]?.updatedAt ?? 0) + 1);

  return {
    agentsPerPage: preferences.agentsPerPage?.value ?? 10,
    setAgentsPerPage: (value: number) => {
      if (PAGE_SIZES.includes(value as PageSize)) update({ agentsPerPage: { value: value as PageSize, updatedAt: nextTimestamp("agentsPerPage") } });
    },
    pinnedAppIds: preferences.pinnedAppIds?.value ?? [],
    setPinnedAppIds: (value: string[]) => update({ pinnedAppIds: { value, updatedAt: nextTimestamp("pinnedAppIds") } }),
  };
}
