"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Laptop, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  CREATE_UI_PLUGIN_HASH,
  openUiPluginCreator,
} from "@/lib/commons-copilot-events";
import { notifyUiPluginsChanged } from "@/lib/ui-plugin-events";
import { useCommonsAppsStore } from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import { AppSettingsSheet } from "./app-settings-sheet";
import { pluginGrants, pluginHasSurface, type UiPlugin } from "./types";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

type LocalAppView = UiPlugin & {
  location?: "local";
  localDirectory?: string;
  cloudPluginId?: string | null;
  runState?: "stopped" | "running" | "failed";
};

export function UiPluginsView() {
  const { mode: workspaceMode, desktop } = useWorkspaceMode();
  const local = workspaceMode === "private-local";
  const [plugins, setPlugins] = useState<UiPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const response = await desktopApiFetch("/api/ui-plugins", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setPlugins(response.ok && Array.isArray(payload.data) ? payload.data : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, workspaceMode]);

  const replace = useCallback((plugin: UiPlugin) => {
    setPlugins((items) => items.map((item) => (item.pluginId === plugin.pluginId ? plugin : item)));
    useCommonsAppsStore.getState().replacePlugin(plugin);
  }, []);

  const setStatus = async (plugin: UiPlugin, status: "active" | "disabled") => {
    setBusyId(plugin.pluginId);
    try {
      const response = await desktopApiFetch(`/api/ui-plugins/${plugin.pluginId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Please try again.");
      replace(payload.data);
      notifyUiPluginsChanged({ pluginId: plugin.pluginId, status: payload.data.status, plugin: payload.data });
    } catch (error) {
      toast({
        title: status === "active" ? "Could not start the app" : "Could not turn off the app",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const keepOnComputer = async (plugin: UiPlugin) => {
    if (!window.agentCommonsDesktop) return;
    setBusyId(plugin.pluginId);
    try {
      await window.agentCommonsDesktop.saveAppLocally({
        pluginId: plugin.pluginId,
        name: plugin.name,
        description: plugin.description ?? undefined,
        entryUrl: plugin.entryUrl,
        manifest: { ...plugin.manifest, capabilities: pluginGrants(plugin) },
      });
      toast({ title: `${plugin.name} is on this computer`, description: "It now also works in Local mode." });
    } catch (error) {
      toast({ title: "Could not keep a copy", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const removeLocal = async (plugin: UiPlugin) => {
    setBusyId(plugin.pluginId);
    try {
      await desktopApiFetch(`/api/ui-plugins/${plugin.pluginId}`, { method: "DELETE" });
      setSelectedId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const selected = plugins.find((plugin) => plugin.pluginId === selectedId) ?? null;
  const ordered = [...plugins].sort((left, right) => Number(right.status === "active") - Number(left.status === "active") || left.name.localeCompare(right.name));

  const overview = selected && (
    <div className="space-y-3">
      {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
      <div className="flex flex-wrap gap-2">
        {selected.status === "active" && pluginHasSurface(selected, "page") && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/apps/${encodeURIComponent(selected.slug)}`}>Open</Link>
          </Button>
        )}
        {selected.status === "active" && (
          <Button size="sm" variant="outline" disabled={busyId === selected.pluginId} onClick={() => void setStatus(selected, "disabled")}>
            Turn off
          </Button>
        )}
        {desktop && !local && selected.status === "active" && selected.deploymentId && (
          <Button size="sm" variant="outline" disabled={busyId === selected.pluginId} onClick={() => void keepOnComputer(selected)}>
            {busyId === selected.pluginId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Laptop className="mr-1.5 h-3.5 w-3.5" />}
            Keep a copy on this computer
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-end">
        <Button asChild size="sm" variant="outline">
          <a
            href={CREATE_UI_PLUGIN_HASH}
            role="button"
            onClick={(event) => {
              event.preventDefault();
              openUiPluginCreator();
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Build an app
          </a>
        </Button>
      </div>

      {!plugins.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No apps yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {local
              ? "Ask an agent to build one in a folder on this computer, or keep a copy of a Cloud app."
              : "Ask Commons Copilot or any agent to build one. It appears here for review."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
          {ordered.map((plugin) => (
            <AppRow key={plugin.pluginId} plugin={plugin} local={local} busy={busyId === plugin.pluginId} onOpen={() => setSelectedId(plugin.pluginId)} />
          ))}
        </div>
      )}

      {!local && (
        <AppSettingsSheet
          plugin={selected}
          mode={selected && selected.status !== "active" ? "review" : "settings"}
          open={Boolean(selected)}
          onOpenChange={(open) => { if (!open) setSelectedId(null); }}
          onUpdated={replace}
          overview={overview}
        />
      )}
      {local && (
        <LocalAppDialog
          plugin={selected as LocalAppView | null}
          busy={Boolean(selected && busyId === selected.pluginId)}
          onClose={() => setSelectedId(null)}
          onStart={(plugin) => void setStatus(plugin, "active")}
          onStop={(plugin) => void setStatus(plugin, "disabled")}
          onRemove={(plugin) => void removeLocal(plugin)}
        />
      )}
    </div>
  );
}

/** Icon, name, and one line. Everything else is one click away. */
function AppRow({ plugin, local, busy, onOpen }: { plugin: UiPlugin; local: boolean; busy: boolean; onOpen: () => void }) {
  const active = plugin.status === "active";
  const state = active ? null : local ? "Stopped" : plugin.status === "draft" ? "Needs review" : "Off";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <AppIcon plugin={plugin} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{plugin.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {plugin.description || (pluginHasSurface(plugin, "page") ? "App" : "Widget")}
        </span>
      </span>
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : state ? (
        <span className={`shrink-0 text-[11px] ${state === "Needs review" ? "text-amber-700" : "text-muted-foreground"}`}>{state}</span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}

function LocalAppDialog({ plugin, busy, onClose, onStart, onStop, onRemove }: {
  plugin: LocalAppView | null;
  busy: boolean;
  onClose: () => void;
  onStart: (plugin: UiPlugin) => void;
  onStop: (plugin: UiPlugin) => void;
  onRemove: (plugin: UiPlugin) => void;
}) {
  const running = plugin?.status === "active";
  return (
    <Dialog open={Boolean(plugin)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {plugin && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <AppIcon plugin={plugin} size={36} />
                <div className="min-w-0">
                  <DialogTitle className="truncate">{plugin.name}</DialogTitle>
                  <DialogDescription className="truncate">
                    {plugin.cloudPluginId ? "Kept on this computer from Commons Cloud" : "Runs from a folder on this computer"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {plugin.description && <p className="text-sm text-muted-foreground">{plugin.description}</p>}
            {plugin.localDirectory && (
              <p className="truncate rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground" title={plugin.localDirectory}>
                {plugin.localDirectory}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {running ? (
                <>
                  {pluginHasSurface(plugin, "page") && (
                    <Button asChild size="sm"><Link href={`/apps/${encodeURIComponent(plugin.slug)}`}>Open</Link></Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onStop(plugin)}>Stop</Button>
                </>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => onStart(plugin)}>
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Start
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => onRemove(plugin)}>
                Remove
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
