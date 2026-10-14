"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type SidebarContextType = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  /** The full-screen navigation menu on phones. */
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// Server and first client render agree on a collapsed sidebar; the saved
// choice applies before paint so there is no hydration mismatch or flash.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const restored = useRef(false);

  useIsomorphicLayoutEffect(() => {
    try {
      const saved = localStorage.getItem("commons.sidebarOpen");
      if (saved !== null) setIsOpen(saved === "true");
    } catch {}
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem("commons.sidebarOpen", String(isOpen));
    } catch {}
  }, [isOpen]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const value = useMemo(() => ({ isOpen, setIsOpen, mobileOpen, setMobileOpen }), [isOpen, mobileOpen]);
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
