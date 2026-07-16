"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, Lock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Skill } from "@agent-commons/sdk";

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = use(params);
  const router = useRouter();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function loadSkill() {
      setLoading(true);
      try {
        const res = await fetch(`/api/skills/${skillId}`);
        const json = await res.json();
        if (alive) setSkill(res.ok ? json.data ?? json : null);
      } catch {
        if (alive) setSkill(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadSkill();
    return () => {
      alive = false;
    };
  }, [skillId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Skill not found.
        <Button variant="outline" size="sm" onClick={() => router.push("/studio/skills")}>
          <ArrowLeft className="h-4 w-4" />
          Back to skills
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-stone-50">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => router.push("/studio/skills")}
            aria-label="Back to skills"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
              {skill.icon ? (
                <span className="text-sm">{skill.icon}</span>
              ) : (
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{skill.name}</h1>
              <p className="truncate text-xs text-muted-foreground">{skill.slug}</p>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          {skill.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {skill.isPublic ? "Public" : "Private"}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Overview</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {skill.description}
              </p>
              {skill.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Instructions</h2>
              <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs leading-5">
                {skill.instructions}
              </pre>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Details</h2>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="text-right">{skill.source}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="text-right">{skill.version}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Uses</dt>
                  <dd className="text-right">{skill.usageCount}</dd>
                </div>
              </dl>
            </div>

            {skill.tools.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Tools</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skill.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {skill.triggers.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Triggers</h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skill.triggers.map((trigger) => (
                    <Badge key={trigger} variant="outline" className="text-xs">
                      {trigger}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
