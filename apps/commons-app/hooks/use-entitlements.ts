"use client";

import { useEffect, useState } from "react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

export interface Entitlements {
  computerUse: boolean;
  allowedProfiles: string[];
  maxComputerAgents: number;
  maxConcurrentComputers: number;
  modelTiers: string[];
  maxConcurrentRuns: number;
}

/**
 * Fetch the signed-in user's plan entitlements once, so the UI can pre-gate
 * paid features (e.g. disable the computer button on the free plan) instead of
 * only reacting to a 402 after the fact.
 */
export function useEntitlements() {
  const { mode } = useWorkspaceMode();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mode === "private-local") {
      setEntitlements({
        computerUse: true,
        allowedProfiles: ["local"],
        maxComputerAgents: 0,
        maxConcurrentComputers: 0,
        modelTiers: ["local"],
        maxConcurrentRuns: 1,
      });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/entitlements", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setEntitlements(json?.data ?? null);
      } catch {
        // Non-fatal: fall back to letting the server 402 if needed.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return { entitlements, loading };
}
