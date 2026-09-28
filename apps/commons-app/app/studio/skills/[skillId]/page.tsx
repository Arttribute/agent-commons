"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ChevronDown, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkillIcon } from "@/components/skills/skill-icon";
import type { Skill } from "@agent-commons/sdk";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { cn } from "@/lib/utils";

export default function SkillDetailPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = use(params);
  const router = useRouter();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadSkill() {
      setLoading(true);
      try {
        const res = await desktopApiFetch(`/api/skills/${skillId}`);
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

  const back = () => router.push("/studio/customize/skills");

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        Skill not found.
        <Button variant="outline" size="sm" onClick={back}>
          <ArrowLeft className="h-4 w-4" />
          Back to skills
        </Button>
      </div>
    );
  }

  const details: Array<[string, React.ReactNode]> = [
    ["Source", skill.source],
    ["Version", skill.version],
    ["Uses", String(skill.usageCount ?? 0)],
    ["Slug", skill.slug],
  ];
  const chips: Array<[string, string[]]> = [
    ["Tools", skill.tools ?? []],
    ["Triggers", skill.triggers ?? []],
    ["Tags", skill.tags ?? []],
  ];

  return (
    <div className="h-full min-w-0 overflow-y-auto bg-page">
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-4">
        <button
          type="button"
          onClick={back}
          className="-ml-1 flex items-center gap-1 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Skills
        </button>

        <header className="mt-6 flex items-start gap-4">
          <SkillIcon icon={skill.icon} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-xl font-medium tracking-tight">
              <span className="truncate">{skill.name}</span>
              {skill.isPublic ? (
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Public" />
              ) : (
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
              )}
            </h1>
            {skill.description && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{skill.description}</p>
            )}
          </div>
        </header>

        <article className="prose prose-sm mt-8 max-w-none prose-headings:font-medium prose-pre:bg-muted prose-pre:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.instructions || "_No instructions yet._"}</ReactMarkdown>
        </article>

        <section className="mt-10 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={detailsOpen}
          >
            Details
            <ChevronDown className={cn("h-3 w-3 transition-transform", detailsOpen && "rotate-180")} />
          </button>
          {detailsOpen && (
            <div className="mt-3 space-y-3 text-xs">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
                {details.map(([label, value]) => value ? (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="truncate text-foreground/80">{value}</dd>
                  </div>
                ) : null)}
              </dl>
              {chips.map(([label, values]) => values.length ? (
                <div key={label} className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-muted-foreground">{label}</span>
                  {values.map((value) => (
                    <span key={value} className="rounded-md bg-muted px-1.5 py-0.5 text-foreground/75">{value}</span>
                  ))}
                </div>
              ) : null)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
