"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  BookOpen,
  Crown,
  Flame,
  Medal,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { cn } from "@/lib/utils";
import { chipStyles } from "@/lib/brand";
import { stripRichTextHtml } from "@/lib/rich-text";
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

type SkillsClientProps = {
  packs: CourseSkillPack[];
  leaderboard: SkillLeaderboardEntry[];
  progressBySlug: Record<string, SkillProgress>;
};

/** Animates a number from 0 to `target` with an ease-out curve. */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      if (reduceMotion) {
        setValue(target);
        return;
      }
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

export function SkillsClient({
  packs,
  leaderboard,
  progressBySlug,
}: SkillsClientProps) {
  const { status } = useSession();
  const [hydratedProgress, setHydratedProgress] = useState(progressBySlug);
  const [progressLoading, setProgressLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (status === "unauthenticated") {
      setHydratedProgress(progressBySlug);
      setProgressLoading(false);
      return;
    }

    if (status !== "authenticated") {
      setProgressLoading(true);
      return;
    }

    async function loadProgress() {
      setProgressLoading(true);
      try {
        const res = await fetch("/api/skills/progress", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          authenticated?: boolean;
          progressBySlug?: Record<string, SkillProgress>;
        };
        if (!cancelled && data.authenticated) {
          setHydratedProgress(data.progressBySlug ?? {});
        }
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }

    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [progressBySlug, status]);

  const showPersonalLoading = status === "loading" || progressLoading;
  const cards = useMemo<SkillCard[]>(
    () =>
      packs.map((pack) => ({
        pack,
        progress: hydratedProgress[pack.skillSlug] || emptyProgress,
      })),
    [hydratedProgress, packs]
  );

  const totals = cards.reduce(
    (acc, item) => {
      const completed = item.progress.completedChallenges.length;
      const earned =
        item.pack.challenges.length > 0 &&
        completed >= item.pack.challenges.length;
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
    {
      points: 0,
      completed: 0,
      earnedSkills: 0,
      inProgress: 0,
      challenges: 0,
      streak: 0,
    }
  );

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              <Sparkles className="h-3.5 w-3.5" />
              AI fluency skills
            </p>
            <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">
              Earn AI skills one{" "}
              <span
                className={cn("rounded-md px-1.5 py-0.5", chipStyles[2])}
              >
                daily badge
              </span>{" "}
              at a time.
            </h1>
            <p className="mt-4 max-w-2xl text-[16px] leading-7 text-slate-700">
              Skills are atomic learning achievements: small enough to finish
              today, useful enough to stack into real AI fluency, and flexible
              enough to live inside courses or stand alone.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Your stats
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat
                icon={Flame}
                label="Streak"
                value={String(totals.streak)}
                chip={chipStyles[2]}
                loading={showPersonalLoading}
              />
              <Stat
                icon={Zap}
                label="Points"
                value={String(totals.points)}
                chip={chipStyles[1]}
                loading={showPersonalLoading}
              />
              <Stat
                icon={Trophy}
                label="Earned"
                value={String(totals.earnedSkills)}
                chip={chipStyles[0]}
                loading={showPersonalLoading}
              />
            </div>
            {totals.inProgress > 0 ? (
              <p className="mt-3 text-right text-xs font-semibold text-slate-500">
                {totals.inProgress} skill path
                {totals.inProgress === 1 ? "" : "s"} in progress
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
          <section className="mt-10 grid gap-4 md:grid-cols-2">
            {cards.map(({ pack, progress }) => {
              const completed = progress.completedChallenges.length;
              const pct = Math.round(
                (completed / pack.challenges.length) * 100
              );
              const fullyComplete = completed === pack.challenges.length;
              const actionLabel =
                completed > 0 && !fullyComplete
                  ? "Continue"
                  : fullyComplete
                    ? "Review"
                    : "Start";
              const nextChallenge =
                pack.challenges.find(
                  (challenge) =>
                    !progress.completedChallenges.includes(challenge.id)
                ) || pack.challenges[pack.challenges.length - 1];

              return (
                <Link
                  key={pack.skillSlug}
                  href={`/skills/${pack.skillSlug}`}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
                >
                  {pack.coverUrl || pack.challenges[0]?.assetUrl ? (
                    <div className="border-b border-slate-100 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pack.coverUrl || pack.challenges[0].assetUrl}
                        alt={
                          pack.coverUrl
                            ? pack.title
                            : pack.challenges[0].assetAlt || ""
                        }
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
                      <span
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-black",
                          chipStyles[0]
                        )}
                      >
                        {fullyComplete
                          ? "Earned"
                          : completed > 0
                            ? `${completed}/${pack.challenges.length}`
                            : `${pack.challenges.length} days`}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                      {stripRichTextHtml(pack.learnerPromise || pack.subtitle)}
                    </p>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          showPersonalLoading
                            ? "animate-pulse bg-slate-200"
                            : "bg-slate-950"
                        }`}
                        style={{
                          width: showPersonalLoading ? "100%" : `${pct}%`,
                        }}
                      />
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">
                          Next daily challenge
                        </p>
                        <p className="truncate text-sm font-bold text-slate-900">
                          {nextChallenge.shortTitle || nextChallenge.title}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white transition-colors group-hover:bg-slate-800">
                        {actionLabel} <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <Leaderboard leaderboard={leaderboard} />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leaderboard — podium + league table                                 */
/* ------------------------------------------------------------------ */

const podiumStyles = [
  {
    // 1st place
    pedestal: "bg-[#FFE177] border-[#F3D05C]",
    ring: "ring-[#FFE177]",
    height: "h-28 sm:h-32",
  },
  {
    // 2nd place
    pedestal: "bg-[#71E0E7] border-[#5DCDD5]",
    ring: "ring-[#71E0E7]",
    height: "h-20 sm:h-24",
  },
  {
    // 3rd place
    pedestal: "bg-[#F3A2B4] border-[#E88EA3]",
    ring: "ring-[#F3A2B4]",
    height: "h-14 sm:h-16",
  },
];

function Leaderboard({
  leaderboard,
}: {
  leaderboard: SkillLeaderboardEntry[];
}) {
  const podium = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  const maxPoints = Math.max(leaderboard[0]?.points ?? 0, 1);

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            <Medal className="h-3.5 w-3.5" />
            Leaderboard
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            The AI fluency league
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Weekly standings from daily challenges — points, streaks, and
            badges earned. Finish today&apos;s challenge to climb.
          </p>
        </div>
        <span
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-black",
            chipStyles[2]
          )}
        >
          This week
        </span>
      </div>

      {leaderboard.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <Trophy className="mx-auto mb-4 h-8 w-8 text-slate-300" />
          <h3 className="text-lg font-semibold text-slate-950">
            The podium is empty — for now
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Complete a daily challenge to start the leaderboard. First finisher
            takes the crown.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Podium */}
          <div className="border-b border-slate-200 bg-slate-50/60 px-4 pb-0 pt-8 sm:px-8">
            <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-3 sm:gap-6">
              {[1, 0, 2].map((rank) => {
                const entry = podium[rank];
                return entry ? (
                  <PodiumSpot key={entry.userId} entry={entry} rank={rank} />
                ) : (
                  <div key={`empty-${rank}`} />
                );
              })}
            </div>
          </div>

          {/* League table */}
          <div>
            {rest.length === 0 ? (
              <p className="px-5 py-5 text-sm text-slate-500">
                Three spots taken — complete a challenge to join the league
                table.
              </p>
            ) : (
              rest.map((row, index) => (
                <LeaderboardRow
                  key={row.userId}
                  row={row}
                  rank={index + 4}
                  maxPoints={maxPoints}
                />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function EntryAvatar({
  entry,
  className,
}: {
  entry: SkillLeaderboardEntry;
  className?: string;
}) {
  if (entry.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.avatarUrl}
        alt=""
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-slate-950 font-black text-white",
        className
      )}
    >
      {entry.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function PodiumSpot({
  entry,
  rank,
}: {
  entry: SkillLeaderboardEntry;
  rank: number;
}) {
  const style = podiumStyles[rank];
  const points = useCountUp(entry.points);
  const isFirst = rank === 0;

  return (
    <div
      className="animate-rise flex min-w-0 flex-col items-center"
      style={{ animationDelay: `${rank * 0.12}s` }}
    >
      <div className="relative">
        {isFirst ? (
          <Crown
            className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 text-amber-500"
            fill="currentColor"
          />
        ) : null}
        <EntryAvatar
          entry={entry}
          className={cn(
            "ring-4",
            style.ring,
            isFirst ? "h-16 w-16 text-xl" : "h-12 w-12 text-base"
          )}
        />
      </div>
      <p className="mt-2 w-full truncate text-center text-sm font-black text-slate-950">
        {entry.name}
        {entry.isCurrentUser ? (
          <span className="ml-1.5 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">
            YOU
          </span>
        ) : null}
      </p>
      <p className="text-xs font-bold tabular-nums text-slate-500">
        {points.toLocaleString()} pts
      </p>
      <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-0.5">
          <Flame className="h-3 w-3 text-orange-500" />
          {entry.streak}
        </span>
        <span className="flex items-center gap-0.5">
          <Trophy className="h-3 w-3 text-amber-500" />
          {entry.completedSkills}
        </span>
      </div>
      <div
        className={cn(
          "mt-3 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 text-2xl font-black text-slate-950/70",
          style.pedestal,
          style.height
        )}
      >
        {rank + 1}
      </div>
    </div>
  );
}

function LeaderboardRow({
  row,
  rank,
  maxPoints,
}: {
  row: SkillLeaderboardEntry;
  rank: number;
  maxPoints: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);
  const pct = Math.max(Math.round((row.points / maxPoints) * 100), 2);

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5",
        row.isCurrentUser && "bg-lime-50/70"
      )}
    >
      <span className="text-sm font-black tabular-nums text-slate-400">
        {rank}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <EntryAvatar entry={row} className="h-9 w-9 shrink-0 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-950">
            {row.name}
            {row.isCurrentUser ? (
              <span className="ml-1.5 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">
                YOU
              </span>
            ) : null}
          </p>
          <div className="mt-1.5 h-1.5 max-w-56 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-950 transition-all duration-700 ease-out"
              style={{ width: mounted ? `${pct}%` : "0%" }}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <span className="hidden items-center gap-1 text-xs font-semibold text-slate-500 sm:flex">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          {row.streak}
        </span>
        <span className="hidden items-center gap-1 text-xs font-semibold text-slate-500 sm:flex">
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          {row.completedSkills}
        </span>
        <span className="w-16 text-sm font-black tabular-nums text-slate-950">
          {row.points.toLocaleString()}
          <span className="ml-0.5 text-[10px] font-bold text-slate-400">
            pts
          </span>
        </span>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  chip,
  loading = false,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  chip: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className={cn("mb-2 inline-flex rounded-md border p-1.5", chip)}>
        <Icon className="h-4 w-4" />
      </div>
      {loading ? (
        <div className="my-1 h-5 w-8 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="text-lg font-black text-slate-950">{value}</p>
      )}
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
