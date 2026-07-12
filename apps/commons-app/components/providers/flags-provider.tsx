"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface FlagEvaluation {
  key: string;
  enabled: boolean;
  variant: string | null;
  payload?: unknown;
}

interface FlagsContextValue {
  flags: Record<string, FlagEvaluation>;
  loading: boolean;
}

const FlagsContext = createContext<FlagsContextValue>({
  flags: {},
  loading: true,
});

/**
 * Fetches all feature-flag evaluations for the signed-in user once per session.
 * Evaluation is deterministic server-side, so there is no client-side
 * re-randomization — a user sees the same variant everywhere.
 */
export function FlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, FlagEvaluation>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/flags", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setFlags(json?.data ?? {});
        }
      } catch {
        // Non-fatal: absent flags read as "off".
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ flags, loading }), [flags, loading]);
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

/** True if the flag is enabled for the current user. */
export function useFeatureFlag(key: string): boolean {
  return useContext(FlagsContext).flags[key]?.enabled ?? false;
}

/** The assigned variant for a multivariate flag (or null). */
export function useVariant(key: string): string | null {
  return useContext(FlagsContext).flags[key]?.variant ?? null;
}

/** The full evaluation (enabled + variant + payload) for a flag. */
export function useFlag(key: string): FlagEvaluation | null {
  return useContext(FlagsContext).flags[key] ?? null;
}

export function useFlagsLoading(): boolean {
  return useContext(FlagsContext).loading;
}
