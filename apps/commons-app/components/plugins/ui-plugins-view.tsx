"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, MessageSquare, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  CREATE_UI_PLUGIN_HASH,
  openUiPluginCreator,
} from "@/lib/commons-copilot-events";
import { notifyUiPluginsChanged } from "@/lib/ui-plugin-events";
import { useCommonsAppsStore } from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import { AppSettingsSheet, useAccessSummary } from "./app-settings-sheet";
import { pluginHasSurface, type UiPlugin } from "./types";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function UiPluginsView() {
  const { mode: workspaceMode } = useWorkspaceMode();
  const local = workspaceMode === "private-local";
  const [plugins, setPlugins] = useState<UiPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{
    pluginId: string;
    mode: "review" | "settings";
  } | null>(null);
  const [localDetails, setLocalDetails] = useState<UiPlugin | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const response = await desktopApiFetch("/api/ui-plugins", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setPlugins(response.ok && Array.isArray(payload.data) ? payload.data : []);
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  const replace = useCallback((plugin: UiPlugin) => {
    setPlugins((items) =>
      items.map((item) => (item.pluginId === plugin.pluginId ? plugin : item)),
    );
    useCommonsAppsStore.getState().replacePlugin(plugin);
  }, []);

  const disable = async (plugin: UiPlugin) => {
    setSavingId(plugin.pluginId);
    notifyUiPluginsChanged({ pluginId: plugin.pluginId, status: "disabled" });
    try {
      const response = await desktopApiFetch(`/api/ui-plugins/${plugin.pluginId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Please try again.");
      replace(payload.data);
      notifyUiPluginsChanged({
        pluginId: plugin.pluginId,
        status: payload.data.status,
        plugin: payload.data,
      });
    } catch (error) {
      notifyUiPluginsChanged({ pluginId: plugin.pluginId, status: plugin.status, plugin });
      toast({
        title: "Could not turn off app",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const enableLocal = async (plugin: UiPlugin) => {
    setSavingId(plugin.pluginId);
    try {
      const response = await desktopApiFetch(`/api/ui-plugins/${plugin.pluginId}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not start Local app");
      replace(payload.data);
      notifyUiPluginsChanged({ pluginId: plugin.pluginId, status: "active", plugin: payload.data });
    } catch (cause) {
      toast({ title: "Could not start Local app", description: cause instanceof Error ? cause.message : undefined, variant: "destructive" });
    } finally { setSavingId(null); }
  };

  if (loading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const active = plugins.filter((plugin) => plugin.status === "active");
  const inactive = plugins.filter((plugin) => plugin.status !== "active");
  const selected = plugins.find((plugin) => plugin.pluginId === sheet?.pluginId) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-lg text-sm text-muted-foreground">
          Apps run in isolated frames and can only use the access you give them.
          Pin them to the apps bar at the top of each page.
        </p>
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
            Ask Commons Copilot or any agent to build one. It appears here for
            review.
          </p>
        </div>
      ) : (
        <>
          {inactive.length > 0 && (
            <AppSection title="Needs review">
              {inactive.map((plugin) => (
                <AppRow
                  key={plugin.pluginId}
                  plugin={plugin}
                  saving={savingId === plugin.pluginId}
                  onToggle={() => local ? void enableLocal(plugin) : setSheet({ pluginId: plugin.pluginId, mode: "review" })}
                  onSettings={() => local ? setLocalDetails(plugin) : setSheet({ pluginId: plugin.pluginId, mode: "review" })}
                />
              ))}
            </AppSection>
          )}
          {active.length > 0 && (
            <AppSection title="Enabled">
              {active.map((plugin) => (
                <AppRow
                  key={plugin.pluginId}
                  plugin={plugin}
                  saving={savingId === plugin.pluginId}
                  onToggle={() => void disable(plugin)}
                  onSettings={() => local ? setLocalDetails(plugin) : setSheet({ pluginId: plugin.pluginId, mode: "settings" })}
                />
              ))}
            </AppSection>
          )}
        </>
      )}

      {!local && <AppSettingsSheet
        plugin={selected}
        mode={sheet?.mode ?? "settings"}
        open={Boolean(sheet && selected)}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        onUpdated={replace}
      />}
      <Dialog open={Boolean(localDetails)} onOpenChange={(open) => { if (!open) setLocalDetails(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{localDetails?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This app runs from a folder on your computer. Its preview remains on loopback.</p>
          <div className="space-y-2 text-xs">
            <p><strong>Folder:</strong> <code className="break-all">{localDetails?.description?.replace(/^Local app in /, "")}</code></p>
            <p><strong>Preview:</strong> <code className="break-all">{localDetails?.entryUrl}</code></p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
        {children}
      </div>
    </section>
  );
}

function AppRow({
  plugin,
  saving,
  onToggle,
  onSettings,
}: {
  plugin: UiPlugin;
  saving: boolean;
  onToggle: () => void;
  onSettings: () => void;
}) {
  const summary = useAccessSummary(plugin);
  const isActive = plugin.status === "active";
  const tags = [
    pluginHasSurface(plugin, "page") && "Page",
    pluginHasSurface(plugin, "widget") && "Widget",
  ].filter(Boolean) as string[];
  const access = [
    summary.read && `reads ${summary.read}`,
    summary.write && `changes ${summary.write}`,
    summary.services && `${summary.services} service${summary.services > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <AppIcon plugin={plugin} size={36} />
      <button type="button" onClick={onSettings} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{plugin.name}</span>
          <span className="text-[11px] text-muted-foreground">v{plugin.version}</span>
          {plugin.manifest.chat && (
            <MessageSquare className="h-3 w-3 text-muted-foreground" aria-label="Works in chat" />
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {plugin.description || tags.join(" · ")}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {[tags.join(" + "), access.length ? access.join(", ") : "no Commons access"]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {isActive && pluginHasSurface(plugin, "page") && (
        <Link
          href={`/apps/${encodeURIComponent(plugin.slug)}`}
          aria-label={`Open ${plugin.name}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      )}
      <button
        type="button"
        onClick={onSettings}
        aria-label={`${plugin.name} settings`}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Switch
          checked={isActive}
          onCheckedChange={onToggle}
          aria-label={isActive ? `Turn off ${plugin.name}` : `Review and enable ${plugin.name}`}
        />
      )}
    </div>
  );
}
