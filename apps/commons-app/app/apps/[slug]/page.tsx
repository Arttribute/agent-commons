"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { PluginFrame } from "@/components/plugins/plugin-frame";
import { isUiPlugin, type UiPlugin } from "@/components/plugins/types";
import { subscribeToUiPluginChanges } from "@/lib/ui-plugin-events";

export default function CustomAppPage() {
  const { slug } = useParams<{ slug: string }>();
  const [plugin, setPlugin] = useState<UiPlugin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const currentPluginId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const response = await fetch(
        `/api/ui-plugins/slug/${encodeURIComponent(slug)}`,
        {
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "App not found");
      if (!isUiPlugin(payload.data)) {
        throw new Error("Commons returned an invalid app manifest.");
      }
      if (payload.data.status !== "active") {
        throw new Error("This custom app has not been enabled.");
      }
      if (
        !payload.data.manifest.surfaces.some(
          (surface) => surface.type === "page",
        )
      ) {
        throw new Error("This custom app does not provide a page.");
      }
      if (sequence !== refreshSequence.current) return;
      currentPluginId.current = payload.data.pluginId;
      setError(null);
      setPlugin(payload.data);
    } catch (reason) {
      if (sequence !== refreshSequence.current) return;
      currentPluginId.current = null;
      setPlugin(null);
      setError(reason instanceof Error ? reason.message : "App not found");
    }
  }, [slug]);

  useEffect(() => {
    currentPluginId.current = null;
    setPlugin(null);
    setError(null);
    void refresh();
    const unsubscribe = subscribeToUiPluginChanges((detail) => {
      const disablesCurrentSlug =
        detail.plugin?.slug === slug && detail.plugin.status !== "active";
      const disablesCurrentPlugin =
        detail.pluginId === currentPluginId.current &&
        detail.status !== undefined &&
        detail.status !== "active";

      if (disablesCurrentSlug || disablesCurrentPlugin) {
        // Invalidate every older response before hiding the frame. A request
        // started before revocation must never be able to render it again.
        refreshSequence.current += 1;
        currentPluginId.current = null;
        setPlugin(null);
        setError("This custom app has been disabled.");
      }
      // Registry events are hints, not trusted manifests. Re-read the active
      // manifest and only apply the newest response for this route.
      void refresh();
    });
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      refreshSequence.current += 1;
      currentPluginId.current = null;
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page p-6">
        <div className="max-w-md rounded-xl border bg-background p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8" />
          <h1 className="font-semibold">Custom app unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link
            href="/studio/customize/apps"
            className="mt-5 inline-flex items-center gap-2 text-sm underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Customize Apps
          </Link>
        </div>
      </main>
    );
  }
  if (!plugin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }
  return (
    <main className="flex h-screen flex-col bg-page">
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
        <Link
          href="/studio/customize/apps"
          aria-label="Back to Customize Apps"
          className="rounded-md p-2 hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{plugin.name}</h1>
          <p className="text-xs text-muted-foreground">
            Sandboxed custom app · v{plugin.version}
          </p>
        </div>
      </header>
      <PluginFrame
        plugin={plugin}
        surface="page"
        className="min-h-0 flex-1 border-0 bg-background"
      />
    </main>
  );
}
