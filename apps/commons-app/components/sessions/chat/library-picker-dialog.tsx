"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LibraryBig, Loader2, Search } from "lucide-react";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type LibraryPickerItem = {
  itemId: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  textPreview?: string | null;
  previewUrl?: string | null;
  updatedAt: string;
};

export function LibraryPickerDialog({
  open,
  onOpenChange,
  attachedFileIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachedFileIds: string[];
  onAdd: (items: LibraryPickerItem[]) => void;
}) {
  const [items, setItems] = useState<LibraryPickerItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    Map<string, LibraryPickerItem>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const attachedIds = useMemo(
    () => new Set(attachedFileIds),
    [attachedFileIds],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedItems(new Map());
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: "100" });
      if (query.trim()) params.set("query", query.trim());
      try {
        const response = await fetch(`/api/library?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.message || payload?.error || "Could not load your Library",
          );
        }
        setItems(Array.isArray(payload) ? payload : payload?.data || []);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load your Library",
        );
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function toggle(item: LibraryPickerItem) {
    if (!isAvailable(item) || attachedIds.has(item.itemId)) return;
    setSelectedItems((current) => {
      const next = new Map(current);
      if (next.has(item.itemId)) next.delete(item.itemId);
      else next.set(item.itemId, item);
      return next;
    });
  }

  function addSelected() {
    if (!selectedItems.size) return;
    onAdd([...selectedItems.values()]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle>Choose from Library</DialogTitle>
          <DialogDescription>
            Attach files you have uploaded or created before.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
              aria-label="Search Library files"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="h-[min(420px,55vh)]">
          <div className="p-2">
            {loading ? (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Library…
              </div>
            ) : error ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  Could not load your Library
                </p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
                <LibraryBig className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  {query ? "No matching files" : "Your Library is empty"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {query
                    ? "Try a different search."
                    : "Upload a file from your device to add it here."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((item) => {
                  const attached = attachedIds.has(item.itemId);
                  const unavailable = !isAvailable(item);
                  const selected = selectedItems.has(item.itemId);
                  return (
                    <button
                      key={item.itemId}
                      type="button"
                      onClick={() => toggle(item)}
                      disabled={attached || unavailable}
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "border-indigo-200 bg-indigo-50"
                          : "hover:bg-muted/70",
                        (attached || unavailable) &&
                          "cursor-not-allowed opacity-55",
                      )}
                    >
                      {item.previewUrl && item.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ArtifactIcon artifact={item} className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatBytes(item.sizeBytes)}
                          {attached
                            ? " · Attached"
                            : unavailable
                              ? ` · ${statusLabel(item.status)}`
                              : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          selected
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-border bg-background",
                        )}
                        aria-hidden="true"
                      >
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-5 py-4 sm:space-x-0">
          <span className="text-xs text-muted-foreground">
            {selectedItems.size
              ? `${selectedItems.size} selected`
              : "Select one or more files"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={addSelected}
              disabled={selectedItems.size === 0}
            >
              Add {selectedItems.size || ""}{" "}
              {selectedItems.size === 1 ? "file" : "files"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isAvailable(item: LibraryPickerItem) {
  return !["processing", "quarantined", "deleted"].includes(item.status);
}

function statusLabel(status: string) {
  if (status === "processing") return "Processing";
  if (status === "quarantined") return "Unavailable";
  return "Unavailable";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}
