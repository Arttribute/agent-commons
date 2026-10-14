"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChartColumn,
  Clock,
  FileText,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  MessageSquareText,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useAgentContext } from "@/context/AgentContext";
import { getBrandIcon } from "@/lib/brand-icons";
import {
  capabilitySuggestions,
  fallbackSuggestions,
  normalizeSuggestions,
  type StartSuggestion,
  type SuggestionKind,
} from "@/lib/start-suggestions";

const CACHE_PREFIX = "commons.startSuggestions.";
const FRESH_MS = 6 * 60 * 60_000;

type Cached = { signature: string; at: number; items: StartSuggestion[] };

function readCache(user: string): Cached | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + user.toLowerCase());
    const parsed = raw ? (JSON.parse(raw) as Cached) : null;
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(user: string, value: Cached) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + user.toLowerCase(), JSON.stringify(value));
  } catch {
    // A cache is a convenience.
  }
}

/**
 * What to suggest under the /new composer: written from recent chats for
 * returning people, and from Agent Commons' capabilities for new ones.
 */
export function useStartSuggestions({
  userAddress,
  sessions,
  sessionsLoading,
}: {
  userAddress: string;
  sessions: Array<{ sessionId: string; title?: string | null }>;
  sessionsLoading: boolean;
}) {
  const { mode } = useWorkspaceMode();
  const cloud = mode === "cloud";
  const [apps, setApps] = useState<string[] | null>(cloud ? null : []);
  const [items, setItems] = useState<StartSuggestion[] | null>(null);

  useEffect(() => {
    if (!cloud || !userAddress) {
      setApps([]);
      return;
    }
    let cancelled = false;
    fetch("/api/connected-apps", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.apps) ? payload.apps : [];
        setApps(list.filter((app: any) => app?.connected && typeof app.name === "string").map((app: any) => app.name as string));
      })
      .catch(() => !cancelled && setApps([]));
    return () => {
      cancelled = true;
    };
  }, [cloud, userAddress]);

  const signature = sessions.length ? `${sessions[0].sessionId}:${sessions.length}` : "";

  useEffect(() => {
    if (!userAddress || sessionsLoading || apps === null) return;
    if (!sessions.length) {
      setItems(capabilitySuggestions(apps));
      return;
    }
    if (!cloud) {
      setItems(fallbackSuggestions(sessions, apps));
      return;
    }
    const cached = readCache(userAddress);
    if (cached?.items.length) setItems(cached.items);
    if (cached && cached.signature === signature && Date.now() - cached.at < FRESH_MS) return;

    let cancelled = false;
    fetch("/api/sessions/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedApps: apps }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Suggestions unavailable");
        return normalizeSuggestions(payload?.data ?? payload);
      })
      .then((next) => {
        if (cancelled) return;
        if (!next.length) throw new Error("No suggestions");
        setItems(next);
        writeCache(userAddress, { signature, at: Date.now(), items: next });
      })
      .catch(() => {
        if (!cancelled && !cached?.items.length) setItems(fallbackSuggestions(sessions, apps));
      });
    return () => {
      cancelled = true;
    };
    // `sessions` is summarized by `signature`; refetch only when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, sessionsLoading, apps, cloud, signature]);

  return { items, loading: items === null };
}

const KIND_ICONS: Record<SuggestionKind, LucideIcon> = {
  research: Globe,
  document: FileText,
  website: PanelsTopLeft,
  schedule: Clock,
  data: ChartColumn,
  image: ImageIcon,
  agent: Bot,
  continue: MessageSquare,
};

function SuggestionIcon({ item }: { item: StartSuggestion }) {
  const brand = item.app ? getBrandIcon(item.app) : null;
  if (brand) {
    const Brand = brand.icon;
    return <Brand size={16} color={brand.monochrome ? undefined : brand.hex} className={brand.monochrome ? "text-foreground" : undefined} />;
  }
  const Icon = (item.kind && KIND_ICONS[item.kind]) || MessageSquareText;
  return <Icon className="h-4 w-4" strokeWidth={1.75} />;
}

/** A quiet list of things to try. Picking one fills the composer. */
export function StartSuggestionList({ items, loading, className }: { items: StartSuggestion[] | null; loading: boolean; className?: string }) {
  const router = useRouter();
  const { setInputText } = useAgentContext();
  const rows = useMemo(() => items ?? [], [items]);

  if (loading) {
    return (
      <div className={className} aria-hidden="true">
        {[0.7, 0.55, 0.62].map((width, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-2.5">
            <span className="h-4 w-4 animate-pulse rounded bg-muted" />
            <span className="h-3.5 animate-pulse rounded bg-muted" style={{ width: `${width * 100}%` }} />
          </div>
        ))}
      </div>
    );
  }
  if (!rows.length) return null;

  return (
    <ul className={className} aria-label="Suggestions">
      {rows.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => {
              if (item.href) {
                router.push(item.href);
                return;
              }
              setInputText(item.prompt ?? item.text);
              requestAnimationFrame(() => {
                const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message your agent"]');
                field?.focus();
                field?.setSelectionRange(field.value.length, field.value.length);
              });
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <SuggestionIcon item={item} />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
