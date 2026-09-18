"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  BookOpen,
  Crown,
  Flame,
  Trophy,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
  const [view, setView] = useState<"paths" | "leaderboard">("paths");

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
    <div className="min-h-screen bg-page text-slate-950">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-medium tracking-tight text-slate-950">Skills</h1>
            <p className="mt-1.5 text-sm text-slate-500">Short daily challenges. Finish a path to earn its badge.</p>
          </div>
          <div className="flex divide-x divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card">
            <Stat icon={Flame} label="Streak" value={String(totals.streak)} loading={showPersonalLoading} />
            <Stat icon={Zap} label="Points" value={String(totals.points)} loading={showPersonalLoading} />
            <Stat icon={Trophy} label="Earned" value={String(totals.earnedSkills)} loading={showPersonalLoading} />
          </div>
        </section>

        <Tabs
          className="mb-6"
          value={view}
          onChange={setView}
          items={[
            { value: "paths", label: "Skill paths", count: cards.length },
            { value: "leaderboard", label: "Leaderboard" },
          ]}
        />

        {view === "leaderboard" ? (
          <Leaderboard leaderboard={leaderboard} />
        ) : cards.length === 0 ? (
          <section className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <BookOpen className="mx-auto mb-3 h-6 w-6 text-slate-300" strokeWidth={1.75} />
            <p className="text-sm text-slate-500">No skill paths are published yet.</p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ pack, progress }) => {
              const completed = progress.completedChallenges.length;
              const pct = Math.round((completed / pack.challenges.length) * 100);
              const fullyComplete = completed === pack.challenges.length;
              const actionLabel =
                completed > 0 && !fullyComplete ? "Continue" : fullyComplete ? "Review" : "Start";
              const image = pack.coverUrl || pack.challenges[0]?.assetUrl;

              return (
                <Link
                  key={pack.skillSlug}
                  href={`/skills/${pack.skillSlug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-floating"
                >
                  {image ? (
                    <div className="aspect-[16/9] overflow-hidden bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt={pack.coverUrl ? pack.title : pack.challenges[0].assetAlt || ""}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col p-5">
                    <p className="truncate text-xs text-slate-500">
                      {pack.courseTitle} · {pack.challenges.length} days
                    </p>
                    <h2 className="mt-1 text-base font-medium text-slate-950">{pack.title}</h2>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-slate-600">
                      {stripRichTextHtml(pack.learnerPromise || pack.subtitle)}
                    </p>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          showPersonalLoading ? "animate-pulse bg-slate-200" : "bg-slate-800",
                        )}
                        style={{ width: showPersonalLoading ? "100%" : `${pct}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        {fullyComplete ? "Badge earned" : completed ? `${completed} of ${pack.challenges.length} done` : "Not started"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-600 transition-colors group-hover:text-slate-950">
                        {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </main>
      <SiteFooter />
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
    <section>
      <p className="mb-3 text-sm text-slate-500">This week, from daily challenge points, streaks and badges.</p>
      {leaderboard.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Trophy className="mx-auto mb-3 h-6 w-6 text-slate-300" strokeWidth={1.75} />
          <p className="text-sm text-slate-500">Complete a daily challenge to start the leaderboard.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
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
                Complete a challenge to join the table.
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
        "flex items-center justify-center rounded-full bg-slate-950 font-medium text-white",
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
      <p className="mt-2 w-full truncate text-center text-sm font-medium text-slate-950">
        {entry.name}
        {entry.isCurrentUser ? (
          <span className="ml-1.5 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-white">
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
          "mt-3 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 text-2xl font-medium text-slate-950/70",
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
      <span className="text-sm font-medium tabular-nums text-slate-400">
        {rank}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        <EntryAvatar entry={row} className="h-9 w-9 shrink-0 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-950">
            {row.name}
            {row.isCurrentUser ? (
              <span className="ml-1.5 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-white">
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
        <span className="w-16 text-sm font-medium tabular-nums text-slate-950">
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
  loading = false,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
      <div>
        {loading ? (
          <div className="my-0.5 h-4 w-6 animate-pulse rounded bg-slate-100" />
        ) : (
          <p className="text-sm font-medium tabular-nums text-slate-950">{value}</p>
        )}
        <p className="text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}
