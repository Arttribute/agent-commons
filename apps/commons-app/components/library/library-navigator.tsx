"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LibraryBig, Loader2, PanelLeftClose, Search } from "lucide-react";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { relativeTime } from "@/lib/relative-time";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useCanvasStore } from "@/stores/canvas-store";
import { useSecondaryNav } from "@/stores/secondary-nav-store";
import { cn } from "@/lib/utils";

type Item = {
  itemId: string;
  name: string;
  kind: string;
  mimeType: string;
  updatedAt: string;
};

/** Every Library file, beside the open one, like the chat list in the sidebar. */
export function LibraryNavigator() {
  const pathname = usePathname() ?? "";
  const { mode } = useWorkspaceMode();
  const open = useSecondaryNav((state) => state.open);
  const setOpen = useSecondaryNav((state) => state.setOpen);
  const remember = useCanvasStore((state) => state.remember);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const currentId = decodeURIComponent(pathname.split("/")[2] ?? "");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      desktopApiFetch("/api/library", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled) return;
          const list: Item[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
          setItems(list);
          remember(list);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    void load();
    window.addEventListener("library-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("library-changed", load);
    };
  }, [mode, remember]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [items, query]);

  if (!open) return null;

  return (
    <nav
      aria-label="Library files"
      className="hidden h-screen w-[260px] shrink-0 flex-col border-r border-border bg-white md:flex"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 px-3">
        <Link
          href="/library"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <LibraryBig className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">Library</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide file list"
          title="Hide file list"
          className="rounded-md p-1.5 text-foreground/60 hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="shrink-0 px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-md bg-muted/60 px-2.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {loading && !items.length ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((item) => {
              const active = item.itemId === currentId;
              return (
                <li key={item.itemId}>
                  <Link
                    href={`/library/${encodeURIComponent(item.itemId)}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <ArtifactIcon artifact={item} className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(item.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
            {!visible.length && <li className="px-2 py-3 text-xs text-muted-foreground">No files match.</li>}
          </ul>
        )}
      </div>
    </nav>
  );
}
