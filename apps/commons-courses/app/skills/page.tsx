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
import type { CourseSkillPack, SkillLeaderboardEntry } from "@/types/skills";

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
  const [leaderboard, setLeaderboard] = useState<SkillLeaderboardEntry[]>([]);
  const [progressBySlug, setProgressBySlug] = useState<Record<string, SkillProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadSkills() {
      setLoading(true);
      try {
        const res = await fetch("/api/skills");
        const data = (await res.json()) as {
          packs?: CourseSkillPack[];
          leaderboard?: SkillLeaderboardEntry[];
        };
        const nextPacks = data.packs ?? [];
        if (cancelled) return;
        setPacks(nextPacks);
        setLeaderboard(data.leaderboard ?? []);

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
    (acc, item) => {
      const completed = item.progress.completedChallenges.length;
      const earned =
        item.pack.challenges.length > 0 && completed >= item.pack.challenges.length;
      const inProgress = completed > 0 && !earned;

      return {
        points: acc.points + item.progress.points,
        completed: acc.completed + completed,
        earnedSkills: acc.earnedSkills + (earned ? 1 : 0),
        inProgress: acc.inProgress + (inProgress ? 1 : 0),
        challenges: acc.challenges + item.pack.challenges.length,
        streak: Math.max(acc.streak, item.progress.streak),
      };
    },
    { points: 0, completed: 0, earnedSkills: 0, inProgress: 0, challenges: 0, streak: 0 }
  );

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
              Earn AI skills one daily badge at a time.
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7 text-slate-700">
              Skills are atomic learning achievements: small enough to finish
              today, useful enough to stack into real AI fluency, and flexible
              enough to live inside courses or stand alone.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Your stats
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat
                icon={Flame}
                label="Streak"
                value={String(totals.streak)}
                color="text-orange-500"
                bg="bg-orange-50"
              />
              <Stat
                icon={Zap}
                label="Points"
                value={String(totals.points)}
                color="text-sky-500"
                bg="bg-sky-50"
              />
              <Stat
                icon={Trophy}
                label="Earned"
                value={String(totals.earnedSkills)}
                color="text-amber-500"
                bg="bg-amber-50"
              />
            </div>
            {totals.inProgress > 0 ? (
              <p className="mt-3 text-right text-xs font-semibold text-slate-500">
                {totals.inProgress} skill path{totals.inProgress === 1 ? "" : "s"} in progress
              </p>
            ) : null}
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
              badge-based AI fluency challenges here.
            </p>
          </section>
        ) : (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            {cards.map(({ pack, progress }) => {
              const completed = progress.completedChallenges.length;
              const pct = Math.round((completed / pack.challenges.length) * 100);
              const fullyComplete = completed === pack.challenges.length;
              const actionLabel =
                completed > 0 && !fullyComplete
                  ? "Continue"
                  : fullyComplete
                    ? "Review"
                    : "Start";
              const nextChallenge =
                pack.challenges.find(
                  (challenge) => !progress.completedChallenges.includes(challenge.id)
                ) || pack.challenges[pack.challenges.length - 1];

              return (
                <Link
                  key={pack.courseSlug}
                  href={`/skills/${pack.courseSlug}`}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                >
                  {pack.challenges[0]?.assetUrl ? (
                    <div className="border-b border-slate-100 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pack.challenges[0].assetUrl}
                        alt={pack.challenges[0].assetAlt || ""}
                        className="h-auto w-full rounded-lg object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="p-5">
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
                        {fullyComplete
                          ? "Earned"
                          : completed > 0
                            ? `${completed}/${pack.challenges.length}`
                            : `${pack.challenges.length} days`}
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
                        {actionLabel} <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <section className="mt-8 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Leaderboard
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Weekly AI fluency standings across points, streaks, and skills
                earned as badges.
              </p>
            </div>
            <div className="rounded-lg bg-amber-100 p-2">
              <Medal className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {leaderboard.length === 0 ? (
              <div className="px-4 py-6 text-sm leading-6 text-slate-600">
                Complete a daily challenge to start the leaderboard.
              </div>
            ) : (
              leaderboard.map((row, index) => (
                <div
                  key={row.userId}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:grid-cols-[auto_1fr_90px_90px_90px_90px_90px] ${
                    row.isCurrentUser ? "bg-lime-50/70" : ""
                  }`}
                >
                  <span className="text-sm font-black text-slate-500">
                    #{index + 1}
                  </span>
                  <div className="flex min-w-0 items-center gap-3">
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.avatarUrl}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-slate-950 ${
                          index === 0
                            ? "bg-amber-200"
                            : index === 1
                              ? "bg-sky-200"
                              : index === 2
                                ? "bg-orange-100"
                                : "bg-slate-100"
                        }`}
                      >
                        {row.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.isCurrentUser ? "You" : "AI fluency league"}
                      </p>
                    </div>
                  </div>
                  <p className="text-right text-sm font-black text-sky-600">
                    {row.points} pts
                  </p>
                  <p className="hidden text-right text-sm font-semibold text-orange-600 sm:block">
                    {row.streak} day
                  </p>
                  <p className="hidden text-right text-sm font-semibold text-amber-600 sm:block">
                    {row.completedSkills} earned
                  </p>
                  <p className="hidden text-right text-xs font-semibold text-sky-600 sm:block">
                    {row.skillPathsInProgress || 0} active
                  </p>
                  <p className="hidden text-right text-sm font-semibold text-slate-500 sm:block">
                    {row.skillPathsStarted} paths
                  </p>
                </div>
              ))
            )}
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
  color,
  bg,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-lg bg-white p-3">
      <div className={`mb-2 inline-flex rounded-md p-1.5 ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-lg font-black text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
