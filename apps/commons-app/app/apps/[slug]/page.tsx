"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { PluginFrame } from "@/components/plugins/plugin-frame";
import type { UiPlugin } from "@/components/plugins/types";

export default function CustomAppPage() {
  const { slug } = useParams<{ slug: string }>();
  const [plugin, setPlugin] = useState<UiPlugin | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ui-plugins/slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "App not found");
        if (payload.data.status !== "active") {
          throw new Error("This custom app has not been enabled.");
        }
        setPlugin(payload.data);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "App not found")
      );
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page p-6">
        <div className="max-w-md rounded-xl border bg-background p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8" />
          <h1 className="font-semibold">Custom app unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link
            href="/studio/apps"
            className="mt-5 inline-flex items-center gap-2 text-sm underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Studio Apps
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
          href="/studio/apps"
          aria-label="Back to Studio Apps"
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
        className="min-h-0 flex-1 border-0 bg-background"
      />
    </main>
  );
}
