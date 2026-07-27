"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Gamepad2,
  Loader2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { useToast } from "@/components/toast-provider";
import type { ExperienceSummaryDTO } from "@/types/experience";

export function ExperienceLibrary({ courseSlug }: { courseSlug: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ExperienceSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(
        `/api/educator/courses/${courseSlug}/experiences`,
      );
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.ok) setItems(data.experiences || []);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  async function createExperience() {
    setCreating(true);
    const response = await fetch(
      `/api/educator/courses/${courseSlug}/experiences`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New immersive experience" }),
      },
    );
    const data = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok || !data.experience?.id) {
      toast({
        tone: "error",
        title: "Could not create experience",
        description: data.error || "Please try again.",
      });
      return;
    }
    window.location.href = `/educator/experience-studio/${data.experience.id}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-60 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading experiences…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 text-white">
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#71E0E7]/20 blur-3xl" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
              <Sparkles className="h-3 w-3 text-[#B8F56D]" />
              Experience Studio
            </span>
            <h3 className="mt-4 max-w-xl text-2xl font-bold sm:text-3xl">
              Turn lessons into worlds learners can explore.
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
              Build character-led stories, decisions, visual explainers, and
              interactive assessments with one harmonized workflow.
            </p>
          </div>
          <button
            type="button"
            onClick={createExperience}
            disabled={creating}
            className="relative inline-flex items-center justify-center gap-2 rounded-xl bg-[#B8F56D] px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#A6E45E] disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create experience
          </button>
        </div>
      </section>

      {items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
            >
              <div
                className="relative h-32 overflow-hidden p-5 text-white"
                style={{
                  backgroundColor: item.status === "published" ? "#091421" : "#172033",
                }}
              >
                <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#71E0E7]/20 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
                    <Gamepad2 className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                      item.status === "published"
                        ? "bg-[#B8F56D] text-slate-950"
                        : "bg-white/10 text-white/65"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-slate-950">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                  {item.description || "An immersive learning experience."}
                </p>
                <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-400">
                  <span>{item.sceneCount} scenes</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {item.characterCount} characters
                  </span>
                  <span>Draft v{item.draftVersion}</span>
                </div>
                <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <Link
                    href={`/educator/experience-studio/${item.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Open studio
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  {item.status === "published" ? (
                    <Link
                      href={`/courses/${courseSlug}/experiences/${item.id}`}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Play
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <Gamepad2 className="mx-auto h-7 w-7 text-slate-300" />
          <h3 className="mt-4 text-lg font-bold text-slate-900">
            Your first experience starts here
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Begin with a guided quest template, then shape the story, cast,
            activities, and visual world in the studio.
          </p>
          <button
            type="button"
            onClick={createExperience}
            disabled={creating}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Create experience
          </button>
        </section>
      )}
    </div>
  );
}
