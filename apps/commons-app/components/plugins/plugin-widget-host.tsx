"use client";

import { useEffect, useMemo, useState } from "react";
import { AppWindow, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { PluginFrame } from "./plugin-frame";
import type { UiPlugin } from "./types";

export function PluginWidgetHost() {
  const [plugins, setPlugins] = useState<UiPlugin[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ui-plugins?active=true", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((payload) =>
        setPlugins(Array.isArray(payload.data) ? payload.data : [])
      )
      .catch(() => setPlugins([]));
  }, []);

  const widgets = useMemo(
    () =>
      plugins.filter((plugin) =>
        plugin.manifest.surfaces.some((surface) => surface.type === "widget")
      ),
    [plugins]
  );
  const openPlugin = widgets.find((plugin) => plugin.pluginId === openId);
  const surface = openPlugin?.manifest.surfaces.find(
    (candidate) => candidate.type === "widget"
  );

  if (!widgets.length) return null;
  return (
    <div className="fixed bottom-5 left-5 z-[70] flex flex-col items-start gap-2">
      {openPlugin && surface && (
        <section
          className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          style={{
            width: `min(${surface.width || 380}px, calc(100vw - 2.5rem))`,
            height: `min(${surface.height || 480}px, calc(100vh - 8rem))`,
          }}
        >
          <header className="flex h-11 items-center gap-2 border-b px-3">
            <AppWindow className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {surface.title || openPlugin.name}
            </span>
            <Link
              href={`/apps/${encodeURIComponent(openPlugin.slug)}`}
              aria-label="Open full page"
              className="rounded-md p-1.5 hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <button
              aria-label="Close widget"
              className="rounded-md p-1.5 hover:bg-muted"
              onClick={() => setOpenId(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <PluginFrame
            plugin={openPlugin}
            className="h-[calc(100%-2.75rem)] w-full border-0"
          />
        </section>
      )}
      <div className="flex gap-2">
        {widgets.map((plugin) => (
          <button
            key={plugin.pluginId}
            type="button"
            onClick={() =>
              setOpenId(openId === plugin.pluginId ? null : plugin.pluginId)
            }
            className="flex h-10 max-w-52 items-center gap-2 rounded-full border bg-background px-3 text-sm shadow-lg hover:bg-muted"
            title={plugin.name}
          >
            <AppWindow className="h-4 w-4 shrink-0" />
            <span className="truncate">{plugin.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
