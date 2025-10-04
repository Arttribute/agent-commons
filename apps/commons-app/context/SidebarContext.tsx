"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type SidebarContextType = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("commons.sidebarOpen");
        if (saved !== null) return saved === "true";
      } catch {}
    }
    return false;
  });

  useEffect(() => {
    try {
      localStorage.setItem("commons.sidebarOpen", String(isOpen));
    } catch {}
  }, [isOpen]);

  const value = useMemo(() => ({ isOpen, setIsOpen }), [isOpen]);
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
