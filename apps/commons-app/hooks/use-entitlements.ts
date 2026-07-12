"use client";

import { useEffect, useState } from "react";

export interface Entitlements {
  computerUse: boolean;
  allowedProfiles: string[];
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
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return { entitlements, loading };
}
