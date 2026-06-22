"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Flame,
  Loader2,
  Medal,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import type { CourseSkillPack } from "@/types/skills";

type SkillProgress = {
  authenticated: boolean;
  enrolled: boolean;
  completedChallenges: string[];
  points: number;
  streak: number;
  longestStreak: number;
};

type SkillCard = {
  pack: CourseSkillPack;
  progress: SkillProgress;
};

const emptyProgress: SkillProgress = {
  authenticated: false,
  enrolled: false,
  completedChallenges: [],
  points: 0,
  streak: 0,
  longestStreak: 0,
};

export default function SkillsPage() {
  const [packs, setPacks] = useState<CourseSkillPack[]>([]);
  const [progressBySlug, setProgressBySlug] = useState<Record<string, SkillProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSkills() {
      setLoading(true);
      try {
        const res = await fetch("/api/skills");
        const data = (await res.json()) as { packs?: CourseSkillPack[] };
        const nextPacks = data.packs ?? [];
        if (cancelled) return;
        setPacks(nextPacks);

        const progressEntries = await Promise.all(
          nextPacks.map(async (pack) => {
            const progressRes = await fetch(`/api/skills/${pack.courseSlug}/progress`);
            if (!progressRes.ok) {
              return [pack.courseSlug, { ...emptyProgress, authenticated: progressRes.status !== 401 }] as const;
            }
            const progress = (await progressRes.json()) as Partial<SkillProgress>;
            return [pack.courseSlug, { ...emptyProgress, ...progress }] as const;
          })
        );
        if (!cancelled) setProgressBySlug(Object.fromEntries(progressEntries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo<SkillCard[]>(
    () =>
      packs.map((pack) => ({
        pack,
        progress: progressBySlug[pack.courseSlug] || emptyProgress,
      })),
    [packs, progressBySlug]
  );

  const totals = cards.reduce(
    (acc, item) => ({
      points: acc.points + item.progress.points,
      completed:
        acc.completed + item.progress.completedChallenges.length,
      challenges: acc.challenges + item.pack.challenges.length,
      streak: Math.max(acc.streak, item.progress.streak),
    }),
    { points: 0, completed: 0, challenges: 0, streak: 0 }
  );
  const completionPct = totals.challenges
    ? Math.round((totals.completed / totals.challenges) * 100)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <div className="flex min-h-screen items-center justify-center pt-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI fluency skills
            </p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Build your daily AI fluency streak.
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7 text-slate-700">
              Short skill paths, focused daily challenges, and quizzes that make
              the concepts stick.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Your stats
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat icon={Flame} label="Streak" value={String(totals.streak)} />
              <Stat icon={Zap} label="Points" value={String(totals.points)} />
              <Stat icon={Trophy} label="Done" value={`${completionPct}%`} />
            </div>
          </div>
        </section>

        {cards.length === 0 ? (
          <section className="mt-12 rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <BookOpen className="mx-auto mb-4 h-8 w-8 text-slate-300" />
            <h2 className="text-xl font-semibold text-slate-950">
              No skill paths are published yet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Add a skillPack to a published course to start rendering daily,
              gamified AI fluency challenges here.
            </p>
          </section>
        ) : (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            {cards.map(({ pack, progress }) => {
              const completed = progress.completedChallenges.length;
              const pct = Math.round((completed / pack.challenges.length) * 100);
              const nextChallenge =
                pack.challenges.find(
                  (challenge) => !progress.completedChallenges.includes(challenge.id)
                ) || pack.challenges[pack.challenges.length - 1];

              return (
                <Link
                  key={pack.courseSlug}
                  href={`/skills/${pack.courseSlug}`}
                  className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {pack.courseTitle}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {pack.title}
                      </h2>
                    </div>
                    <span className="rounded-md bg-[#B8F56D] px-2.5 py-1 text-xs font-black text-slate-950">
                      {completed}/{pack.challenges.length}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                    {pack.learnerPromise || pack.subtitle}
                  </p>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-950 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">Next daily challenge</p>
                      <p className="truncate text-sm font-bold text-slate-900">
                        {nextChallenge.shortTitle || nextChallenge.title}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">
                      Start <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Leaderboard
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Your points are ready. Shared leaderboards can plug into the same
                scoring model next.
              </p>
            </div>
            <Medal className="h-5 w-5 text-slate-500" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ["You", totals.points],
              ["Amina", 220],
              ["Kofi", 180],
            ].map(([name, points], index) => (
              <div key={name} className="rounded-lg bg-white px-3 py-2 text-sm">
                <p className="font-bold text-slate-950">
                  {index + 1}. {name}
                </p>
                <p className="text-slate-500">{points} pts</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-white p-3">
      <Icon className="mb-2 h-4 w-4 text-slate-500" />
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
