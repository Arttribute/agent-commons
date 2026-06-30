"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Globe, Key, Lock, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tool } from "@/types/tool";

const visibilityIcon = {
  private: Lock,
  public: Globe,
  platform: Building2,
};

function JsonBlock({ value }: { value: unknown }) {
  if (!value) return null;
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function ToolDetailPage({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = use(params);
  const router = useRouter();
  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function loadTool() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tools/${toolId}`);
        const json = await res.json();
        if (alive) setTool(res.ok ? json.data ?? json : null);
      } catch {
        if (alive) setTool(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadTool();
    return () => {
      alive = false;
    };
  }, [toolId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Tool not found.
        <Button variant="outline" size="sm" onClick={() => router.push("/studio/tools")}>
          <ArrowLeft className="h-4 w-4" />
          Back to tools
        </Button>
      </div>
    );
  }

  const VisibilityIcon = visibilityIcon[tool.visibility] ?? Lock;
  const displayName = tool.displayName || tool.name;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push("/studio/tools")}
            aria-label="Back to tools"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{displayName}</h1>
              <p className="truncate text-xs text-muted-foreground">{tool.name}</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 text-xs capitalize">
          <VisibilityIcon className="h-3 w-3" />
          {tool.visibility}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Overview</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {tool.description || "No description provided."}
              </p>
              {tool.tags && tool.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Schema</h2>
              <div className="mt-3">
                <JsonBlock value={tool.schema || tool.inputSchema} />
              </div>
            </div>

            {tool.apiSpec && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">API Spec</h2>
                <div className="mt-3">
                  <JsonBlock value={tool.apiSpec} />
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Details</h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="text-right">{tool.category || "Uncategorized"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="text-right">{tool.version || "1.0.0"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Executions</dt>
                  <dd className="text-right">{tool.executionCount ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Auth</dt>
                  <dd className="text-right">{tool.apiSpec?.authType || "none"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Key className="h-4 w-4 text-muted-foreground" />
                Identifier
              </h2>
              <p className="mt-3 break-all rounded-md bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
                {tool.toolId}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
