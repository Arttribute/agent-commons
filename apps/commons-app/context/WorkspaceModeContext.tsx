"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DesktopInfo } from "@agent-commons/desktop-contract";
import { useRouter } from "next/navigation";
import { useCommonsAppsStore } from "@/lib/commons-apps-store";
import { setDesktopApiMode } from "@/lib/desktop-api-fetch";

type Mode = DesktopInfo["mode"];
type WorkspaceModeValue = {
  mode: Mode;
  desktop: boolean;
  setMode: (mode: Mode) => Promise<void>;
};

const WorkspaceModeContext = createContext<WorkspaceModeValue>({
  mode: "cloud",
  desktop: false,
  setMode: async () => undefined,
});

export function WorkspaceModeProvider({ initialMode, children }: { initialMode: Mode; children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setCurrentMode] = useState<Mode>(initialMode);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const bridge = window.agentCommonsDesktop;
    setDesktop(Boolean(bridge));
    if (!bridge) return;
    void bridge.getInfo().then((info) => { setDesktopApiMode(info.mode); setCurrentMode(info.mode); }).catch(() => undefined);
    return bridge.onModeChange((next, path) => {
      setDesktopApiMode(next);
      setCurrentMode(next);
      if (path && path !== window.location.pathname) router.replace(path);
      router.refresh();
      void useCommonsAppsStore.getState().refresh();
    });
  }, [router]);

  const setMode = useCallback(async (next: Mode) => {
    if (next === mode) return;
    if (next === "private-local") {
      await window.agentCommonsDesktop?.openPrivateWorkspace(window.location.pathname + window.location.search);
    } else {
      await window.agentCommonsLocal?.openCloud(window.location.pathname + window.location.search);
      if (window.agentCommonsDesktop && window.agentCommonsLocal) {
        const response = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
        const session = await response?.json().catch(() => null);
        if (!session?.user?.id) await window.agentCommonsDesktop.beginSignIn();
      }
    }
    setCurrentMode(next);
    setDesktopApiMode(next);
  }, [mode]);

  const value = useMemo(() => ({ mode, desktop, setMode }), [mode, desktop, setMode]);
  return <WorkspaceModeContext.Provider value={value}>{children}</WorkspaceModeContext.Provider>;
}

export function useWorkspaceMode() {
  return useContext(WorkspaceModeContext);
}
