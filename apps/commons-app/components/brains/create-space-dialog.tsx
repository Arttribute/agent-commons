"use client";

import { useEffect, useState } from "react";
import { FolderInput, Loader2, Sparkles } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  chooseMarkdownFolder,
  rememberMarkdownFolder,
  supportsBrowserFolders,
} from "./browser-folder";
import type { KnowledgeSpace } from "./types";

export function CreateSpaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (space: KnowledgeSpace) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<"native" | "browser_filesystem">("native");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allAgents, setAllAgents] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("native");
    setName("");
    setDescription("");
    setAllAgents(true);
    setError("");
  }, [open]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      let folder: Awaited<ReturnType<typeof chooseMarkdownFolder>> | undefined;
      if (mode === "browser_filesystem") folder = await chooseMarkdownFolder();
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || folder?.name || "New Knowledge Space",
          description: description.trim() || undefined,
          provider: mode,
          providerConfig: folder ? { folderName: folder.name } : undefined,
          allAgents,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(apiMessage(payload, "Could not create space"));
      const space = payload.data as KnowledgeSpace;
      if (folder) {
        await rememberMarkdownFolder(space.spaceId, folder.handle);
        if (folder.documents.length || folder.folders.length) {
          const imported = await fetch(
            `/api/knowledge/${space.spaceId}/import`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                documents: folder.documents,
                folders: folder.folders,
              }),
            },
          );
          const importPayload = await imported.json();
          if (!imported.ok) {
            throw new Error(
              apiMessage(importPayload, "Space created, but import failed"),
            );
          }
        }
      }
      await onCreated(space);
      onOpenChange(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(
        cause instanceof Error ? cause.message : "Could not create space",
      );
    } finally {
      setBusy(false);
    }
  }

  const folderSupported =
    typeof window === "undefined" || supportsBrowserFolders();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create a Knowledge Space</DialogTitle>
          <DialogDescription>
            Choose native Commons storage or connect a portable Markdown folder.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            type="button"
            onClick={() => setMode("native")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:bg-stone-50",
              mode === "native" &&
                "border-teal-500 bg-teal-50/50 ring-2 ring-teal-100",
            )}
          >
            <Sparkles className="mb-3 h-5 w-5 text-teal-700" />
            <span className="block text-sm font-medium">Commons native</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Ready for every Commons agent with no setup.
            </span>
          </button>
          <button
            type="button"
            disabled={!folderSupported}
            onClick={() => setMode("browser_filesystem")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors hover:bg-stone-50 disabled:opacity-45",
              mode === "browser_filesystem" &&
                "border-teal-500 bg-teal-50/50 ring-2 ring-teal-100",
            )}
          >
            <FolderInput className="mb-3 h-5 w-5 text-sky-700" />
            <span className="block text-sm font-medium">Markdown folder</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Connect a portable folder of Markdown files on this device.
            </span>
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                mode === "native"
                  ? "Product knowledge"
                  : "Uses folder name if blank"
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should agents use this knowledge for?"
              className="min-h-20 resize-none"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-stone-50/70 p-3">
            <div className="pr-4">
              <p className="text-sm font-medium">Share with my agents</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Existing and future agents receive write access. You can refine
                this later.
              </p>
            </div>
            <Switch checked={allAgents} onCheckedChange={setAllAgents} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={busy || (mode === "native" && !name.trim())}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "native" ? "Create space" : "Choose folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function apiMessage(payload: any, fallback: string) {
  const message = payload?.message || payload?.error;
  return Array.isArray(message) ? message.join(", ") : message || fallback;
}
