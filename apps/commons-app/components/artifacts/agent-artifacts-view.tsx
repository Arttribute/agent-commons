"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  FileText,
  Film,
  Grid2X2,
  Image as ImageIcon,
  LibraryBig,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { ArtifactSurface } from "@/components/artifacts/artifact-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { artifactLabel, prettyBytes, type ArtifactRef } from "@/lib/artifacts";
import { cn } from "@/lib/utils";

type AgentArtifact = {
  itemId: string;
  name: string;
  description?: string | null;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  source: string;
  sourceSessionId?: string | null;
  sessionTitle?: string | null;
  textPreview?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

const views = [
  ["all", "All", Grid2X2],
  ["images", "Images", ImageIcon],
  ["documents", "Documents", FileText],
  ["media", "Media", Film],
  ["apps", "Apps", AppWindow],
] as const;

export function AgentArtifactsView({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<AgentArtifact[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<(typeof views)[number][0]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState<ArtifactRef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ agentId });
      if (query.trim()) params.set("query", query.trim());
      if (view !== "all") params.set("view", view);
      const response = await fetch(`/api/library?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Could not load artifacts",
        );
      }
      setItems(Array.isArray(payload) ? payload : payload?.data || []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load artifacts",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId, query, view]);

  useEffect(() => {
    const timer = window.setTimeout(load, 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AgentArtifact[]>();
    for (const item of items) {
      const label = item.sessionTitle || "Agent workspace";
      groups.set(label, [...(groups.get(label) || []), item]);
    }
    return [...groups.entries()];
  }, [items]);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-auto">
        <header className="border-b border-border/70 px-5 py-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-lg font-medium tracking-tight">Artifacts</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Library items uploaded, attached, or created in this
                agent&apos;s sessions.
              </p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this agent's artifacts"
                className="h-9 pl-9"
              />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-5xl p-5">
          <div className="mb-5 flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
            {views.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors",
                  view === id
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={load}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Try again
              </Button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-16 text-center">
              <LibraryBig className="mx-auto h-9 w-9 text-muted-foreground/35" />
              <p className="mt-3 text-sm font-medium">No artifacts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Attach a Library item in chat or ask this agent to create a
                file.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([label, artifacts]) => (
                <section key={label}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-medium">{label}</h2>
                    <span className="text-xs text-muted-foreground">
                      {artifacts.length} item{artifacts.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {artifacts.map((item) => (
                      <button
                        key={item.itemId}
                        type="button"
                        onClick={() =>
                          setPreviewing({
                            fileId: item.itemId,
                            name: item.name,
                            mimeType: item.mimeType,
                            kind: item.kind,
                            sizeBytes: item.sizeBytes,
                            status: item.status,
                            textPreview: item.textPreview,
                          })
                        }
                        className="group overflow-hidden rounded-xl border bg-background text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex h-36 items-center justify-center overflow-hidden bg-muted/50">
                          {item.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.previewUrl}
                              alt=""
                              className="h-full w-full object-contain"
                            />
                          ) : item.textPreview ? (
                            <div className="h-full w-full overflow-hidden whitespace-pre-wrap bg-background p-4 text-[11px] leading-4 text-muted-foreground [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
                              {item.textPreview}
                            </div>
                          ) : (
                            <ArtifactIcon
                              artifact={item}
                              className="h-8 w-8 text-muted-foreground/45"
                            />
                          )}
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-medium group-hover:underline">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {artifactLabel(item)} ·{" "}
                            {prettyBytes(item.sizeBytes)} ·{" "}
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {previewing && (
        <ArtifactSurface
          artifact={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
