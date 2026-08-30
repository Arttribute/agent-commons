"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AppWindow,
  ExternalLink,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { openUiPluginCreator } from "@/lib/commons-copilot-events";
import { notifyUiPluginsChanged } from "@/lib/ui-plugin-events";
import type { UiPlugin } from "./types";

export function UiPluginsView() {
  const [plugins, setPlugins] = useState<UiPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const savingIdsRef = useRef(new Set<string>());
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/ui-plugins", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setPlugins(response.ok && Array.isArray(payload.data) ? payload.data : []);
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  const toggle = async (plugin: UiPlugin, active: boolean) => {
    if (savingIdsRef.current.has(plugin.pluginId)) return;
    savingIdsRef.current.add(plugin.pluginId);
    setSavingIds(new Set(savingIdsRef.current));
    const optimisticPlugin: UiPlugin = {
      ...plugin,
      status: active ? "active" : "disabled",
    };
    setPlugins((items) =>
      items.map((item) =>
        item.pluginId === plugin.pluginId ? optimisticPlugin : item,
      ),
    );
    // Removing a widget optimistically is safe and makes disabling feel
    // immediate. Enabling waits for the API to re-check the pinned,
    // verified deployment before the widget host is allowed to mount it.
    if (!active) {
      notifyUiPluginsChanged({
        pluginId: plugin.pluginId,
        status: optimisticPlugin.status,
        plugin: optimisticPlugin,
      });
    }
    try {
      const response = await fetch(
        `/api/ui-plugins/${plugin.pluginId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: active ? "active" : "disabled" }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPlugins((items) =>
          items.map((item) =>
            item.pluginId === plugin.pluginId ? plugin : item,
          ),
        );
        notifyUiPluginsChanged({
          pluginId: plugin.pluginId,
          status: plugin.status,
          plugin,
        });
        toast({
          title: "Could not update app",
          description: payload.message || payload.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }
      setPlugins((items) =>
        items.map((item) =>
          item.pluginId === plugin.pluginId ? payload.data : item,
        ),
      );
      notifyUiPluginsChanged({
        pluginId: plugin.pluginId,
        status: payload.data.status,
        plugin: payload.data,
      });
    } catch {
      setPlugins((items) =>
        items.map((item) =>
          item.pluginId === plugin.pluginId ? plugin : item,
        ),
      );
      notifyUiPluginsChanged({
        pluginId: plugin.pluginId,
        status: plugin.status,
        plugin,
      });
      toast({
        title: "Could not update app",
        description: "The app registry could not be reached. Please try again.",
        variant: "destructive",
      });
    } finally {
      savingIdsRef.current.delete(plugin.pluginId);
      setSavingIds(new Set(savingIdsRef.current));
    }
  };

  if (loading) {
    return (
      <div className="flex h-52 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
          <p>
            Custom apps run in isolated frames. Review each app and its
            permissions before enabling it; generated drafts never appear in
            your UI automatically.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-muted-foreground">
          Opens an editable brief; nothing runs until you send it.
        </p>
        <Button onClick={openUiPluginCreator}>
          <Plus className="mr-2 h-4 w-4" />
          Open Commons Copilot
        </Button>
      </div>
      {!plugins.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <AppWindow className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No custom apps yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Prompt Commons Copilot to make a page or floating widget.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background">
          {plugins.map((plugin) => (
            <div
              key={plugin.pluginId}
              className="flex flex-wrap items-center gap-4 border-b p-4 last:border-b-0"
            >
              <div className="rounded-lg border bg-muted p-2">
                <AppWindow className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{plugin.name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    v{plugin.version}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {plugin.description ||
                    plugin.manifest.surfaces
                      .map((surface) => surface.type)
                      .join(" + ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Commons access:{" "}
                  {plugin.manifest.capabilities?.length
                    ? plugin.manifest.capabilities
                        .map((grant) =>
                          grant.resourceIds?.length
                            ? `${grant.name} (${grant.resourceIds.length} scoped)`
                            : grant.name,
                        )
                        .join(", ")
                    : "none"}
                </p>
                {plugin.manifest.permissions.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    UI permissions: {plugin.manifest.permissions.join(", ")}
                  </p>
                )}
              </div>
              {plugin.manifest.surfaces.some(
                (surface) => surface.type === "page",
              ) && (
                <Link
                  href={`/apps/${encodeURIComponent(plugin.slug)}`}
                  className="inline-flex items-center gap-1.5 text-sm hover:underline"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {plugin.status === "active" ? "Enabled" : "Disabled"}
                </span>
                {savingIds.has(plugin.pluginId) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Switch
                    checked={plugin.status === "active"}
                    onCheckedChange={(checked) => toggle(plugin, checked)}
                    aria-label={`Enable ${plugin.name}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
