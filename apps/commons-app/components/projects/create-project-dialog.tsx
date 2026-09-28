"use client";

import { useEffect, useState } from "react";
import { Cloud, FolderInput, Laptop, Loader2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { projectsApi, type ProjectDetail } from "@/hooks/use-projects";
import { canImportProjectFolder, importProjectFolder, type ImportedFolder } from "@/lib/project-folder-import";

/**
 * Two questions and an optional folder. The folder becomes the project's
 * knowledge; everything else can be added later from the project page.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: ProjectDetail) => void;
}) {
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState<ImportedFolder | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setFolder(null);
    setError("");
  }, [open]);

  const chooseFolder = async () => {
    setImporting(true);
    setError("");
    try {
      const imported = await importProjectFolder(local);
      if (imported) {
        setFolder(imported);
        setName((current) => current || imported.name);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The folder could not be imported");
    } finally {
      setImporting(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const project = await projectsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        knowledgeSpaceIds: folder?.knowledgeSpaceIds,
        libraryItemIds: folder?.libraryItemIds,
      });
      onOpenChange(false);
      onCreated?.(project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">What are you working on?</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name your project"
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) void create();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-goal">What are you trying to achieve?</Label>
            <Textarea
              id="project-goal"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the project, its goals, audience, or subject"
              className="min-h-24 resize-none"
            />
          </div>
          {folder ? (
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{folder.name}</span>
                <span className="block text-xs text-muted-foreground">{folder.summary}</span>
              </span>
              <button
                type="button"
                onClick={() => setFolder(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove folder"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            canImportProjectFolder(local) && (
              <button
                type="button"
                onClick={() => void chooseFolder()}
                disabled={importing}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FolderInput className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm">Import a folder</span>
                  <span className="block text-xs text-muted-foreground">
                    Optional. Notes and documents become project knowledge.
                  </span>
                </span>
              </button>
            )
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            {local ? <Laptop className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
            {local ? "Stays on this computer" : "Saved to Commons Cloud"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={saving || importing || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create project
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
