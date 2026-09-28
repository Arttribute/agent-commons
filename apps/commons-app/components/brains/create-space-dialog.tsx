"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";

import { useEffect, useState } from "react";
import { FolderInput, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { InfoHint } from "@/components/ui/info-hint";
import {
  chooseMarkdownFolder,
  rememberMarkdownFolder,
  supportsBrowserFolders,
} from "./browser-folder";
import type { KnowledgeSpace } from "./types";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

type ChosenFolder =
  | { kind: "local"; name: string; path: string }
  | { kind: "browser"; name: string; picked: Awaited<ReturnType<typeof chooseMarkdownFolder>> };

/**
 * One form for every Knowledge Space. Starting from a folder is an optional
 * step: locally the folder stays linked and in sync; in Cloud its Markdown
 * notes are imported and the folder stays connected in this browser.
 */
export function CreateSpaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (space: KnowledgeSpace) => Promise<void> | void;
}) {
  const { mode: workspaceMode } = useWorkspaceMode();
  const local = workspaceMode === "private-local";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allAgents, setAllAgents] = useState(true);
  const [folder, setFolder] = useState<ChosenFolder | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setAllAgents(true);
    setFolder(null);
    setError("");
  }, [open]);

  const folderSupported = local || typeof window === "undefined" || supportsBrowserFolders();

  async function chooseFolder() {
    setChoosing(true);
    setError("");
    try {
      if (local) {
        const [path] = (await window.agentCommonsLocal?.chooseKnowledgeFolders()) ?? [];
        if (!path) return;
        const folderName = path.split(/[\\/]/).filter(Boolean).at(-1) || "Folder";
        setFolder({ kind: "local", name: folderName, path });
        setName((current) => current || folderName);
      } else {
        const picked = await chooseMarkdownFolder();
        setFolder({ kind: "browser", name: picked.name, picked });
        setName((current) => current || picked.name);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "Could not open the folder");
      }
    } finally {
      setChoosing(false);
    }
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const browserFolder = folder?.kind === "browser" ? folder.picked : undefined;
      const response = await desktopApiFetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || folder?.name || "New Knowledge Space",
          description: description.trim() || undefined,
          provider: browserFolder ? "browser_filesystem" : "native",
          providerConfig: browserFolder ? { folderName: browserFolder.name } : undefined,
          folders: folder?.kind === "local" ? [folder.path] : [],
          allAgents,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiMessage(payload, "Could not create space"));
      const space = payload.data as KnowledgeSpace;
      if (browserFolder) {
        await rememberMarkdownFolder(space.spaceId, browserFolder.handle);
        if (browserFolder.documents.length || browserFolder.folders.length) {
          const imported = await desktopApiFetch(`/api/knowledge/${space.spaceId}/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documents: browserFolder.documents, folders: browserFolder.folders }),
          });
          const importPayload = await imported.json();
          if (!imported.ok) throw new Error(apiMessage(importPayload, "Space created, but import failed"));
        }
      }
      await onCreated(space);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create space");
    } finally {
      setBusy(false);
    }
  }

  const folderDetail = folder?.kind === "local"
    ? "Stays linked. Edits made in other apps appear here."
    : folder?.kind === "browser"
      ? `${folder.picked.documents.length} Markdown notes will be imported`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New Knowledge Space</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input
              id="space-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Product research"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should agents use this knowledge for?"
              className="min-h-20 resize-none"
            />
          </div>
          {folder ? (
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{folder.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{folderDetail}</span>
              </span>
              <button type="button" onClick={() => setFolder(null)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove folder">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : folderSupported ? (
            <button
              type="button"
              onClick={() => void chooseFolder()}
              disabled={choosing}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              {choosing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0">
                <span className="block text-sm">Start from a folder</span>
                <span className="block text-xs text-muted-foreground">Optional. Skip to start with an empty space.</span>
              </span>
            </button>
          ) : null}
          <label className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm">
              Share with my agents
              <InfoHint>Current and future agents can read and edit this space, and search it automatically when a request needs it. You can change access per agent later.</InfoHint>
            </span>
            <Switch checked={allAgents} onCheckedChange={setAllAgents} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={busy || choosing || (!name.trim() && !folder)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create space
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
