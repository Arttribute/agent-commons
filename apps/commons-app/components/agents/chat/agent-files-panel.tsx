"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LibraryBig, Loader2 } from "lucide-react";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { shortTime } from "@/lib/short-time";
import { cn } from "@/lib/utils";

type FileItem = {
  itemId: string;
  name: string;
  kind: string;
  mimeType: string;
  previewUrl?: string | null;
  updatedAt: string;
};

type Group = "media" | "docs" | "apps";

function groupOf(item: FileItem): Group {
  const mime = item.mimeType || "";
  if (mime.startsWith("image/") || mime.startsWith("video/") || ["image", "video"].includes(item.kind)) return "media";
  if (["app", "webapp", "website", "code-project"].includes(item.kind) || mime === "text/html") return "apps";
  return "docs";
}

const GROUPS: Array<[Group, string]> = [
  ["media", "Media"],
  ["docs", "Docs"],
  ["apps", "Apps"],
];

/** Files this agent made or was given, the way a chat app shows shared media and docs. */
export function AgentFilesPanel({ agentId, onSeeAll }: { agentId: string; onSeeAll: () => void }) {
  const [items, setItems] = useState<FileItem[] | null>(null);
  const [error, setError] = useState(false);
  const [group, setGroup] = useState<Group>("media");

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(false);
    desktopApiFetch(`/api/library?${new URLSearchParams({ agentId })}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error();
        return (Array.isArray(payload) ? payload : payload?.data ?? []) as FileItem[];
      })
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        // Open on the first group that has something in it.
        const first = GROUPS.find(([key]) => list.some((item) => groupOf(item) === key));
        if (first) setGroup(first[0]);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const counts = useMemo(() => {
    const result: Record<Group, number> = { media: 0, docs: 0, apps: 0 };
    for (const item of items ?? []) result[groupOf(item)] += 1;
    return result;
  }, [items]);
  const visible = useMemo(() => (items ?? []).filter((item) => groupOf(item) === group), [items, group]);

  if (error) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Files could not be loaded.</p>;
  if (!items) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <LibraryBig className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium">No files yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Files you share in chat and files this agent makes show up here.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="File types">
        {GROUPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            onClick={() => setGroup(key)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs transition-colors",
              group === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {counts[key] > 0 && <span className="ml-1 text-muted-foreground">{counts[key]}</span>}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Nothing here yet.</p>
      ) : group === "media" ? (
        <div className="grid grid-cols-3 gap-1">
          {visible.slice(0, 24).map((item) => (
            <Link
              key={item.itemId}
              href={`/library/${encodeURIComponent(item.itemId)}`}
              title={item.name}
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <ArtifactIcon artifact={item} className="h-5 w-5 text-muted-foreground/60" />
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <ul className="-mx-1">
          {visible.slice(0, 30).map((item) => (
            <li key={item.itemId}>
              <Link
                href={`/library/${encodeURIComponent(item.itemId)}`}
                className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <ArtifactIcon artifact={item} className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">{shortTime(item.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onSeeAll} className="mt-4 w-full rounded-lg py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
        See all files
      </button>
    </div>
  );
}
