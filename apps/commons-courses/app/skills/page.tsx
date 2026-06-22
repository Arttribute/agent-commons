"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CheckCircle2,
  Flame,
  Gauge,
  Loader2,
  Medal,
  Radio,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { cn } from "@/lib/utils";
import type { CourseSkillPack, SkillChallenge } from "@/types/skills";

type SkillProgress = {
  authenticated: boolean;
  enrolled: boolean;
  completedChallenges: string[];
  challengeAnswers: Record<string, number>;
  points: number;
  streak: number;
  longestStreak: number;
  practicalSignals: Array<{
    id: string;
    platform: string;
    eventType: string;
    status: "pending" | "verified";
  }>;
};

const emptyProgress: SkillProgress = {
  authenticated: false,
  enrolled: false,
  completedChallenges: [],
  challengeAnswers: {},
  points: 0,
  streak: 0,
  longestStreak: 0,
  practicalSignals: [],
};

export default function SkillsPage() {
  const [packs, setPacks] = useState<CourseSkillPack[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [progress, setProgress] = useState<SkillProgress>(emptyProgress);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [progressLoading, setProgressLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPacks() {
      setLoading(true);
      try {
        const res = await fetch("/api/skills");
        const data = (await res.json()) as { packs?: CourseSkillPack[] };
        if (cancelled) return;
        const nextPacks = data.packs ?? [];
        setPacks(nextPacks);
        setSelectedSlug((current) => current || nextPacks[0]?.courseSlug || "");
        setSelectedChallengeId(
          (current) => current || nextPacks[0]?.challenges[0]?.id || ""
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPacks();
    return () => {
      cancelled = true;
    };
  }, []);

  const pack = useMemo(
    () => packs.find((item) => item.courseSlug === selectedSlug) || packs[0],
    [packs, selectedSlug]
  );

  const challenge = useMemo(
    () =>
      pack?.challenges.find((item) => item.id === selectedChallengeId) ||
      pack?.challenges[0],
    [pack, selectedChallengeId]
  );

  useEffect(() => {
    if (!pack) return;
    let cancelled = false;
    async function loadProgress() {
      setProgressLoading(true);
      try {
        const res = await fetch(`/api/skills/${pack.courseSlug}/progress`);
        if (!res.ok) {
          if (!cancelled) setProgress({ ...emptyProgress, authenticated: res.status !== 401 });
          return;
        }
        const data = (await res.json()) as Partial<SkillProgress>;
        if (!cancelled) setProgress({ ...emptyProgress, ...data });
      } finally {
        if (!cancelled) setProgressLoading(false);
      }
    }
    loadProgress();
    setSelectedChallengeId(pack.challenges[0]?.id || "");
    return () => {
      cancelled = true;
    };
  }, [pack]);

  useEffect(() => {
    if (!challenge) return;
    const answers = Object.fromEntries(
      challenge.questions
        .map((question) => [
          question.id,
          progress.challengeAnswers[`${challenge.id}:${question.id}`],
        ])
        .filter(([, answer]) => answer !== undefined)
    ) as Record<string, number>;
    setSelectedAnswers(answers);
    setFeedback(null);
  }, [challenge, progress.challengeAnswers]);

  const completed = Boolean(
    challenge && progress.completedChallenges.includes(challenge.id)
  );
  const unlockedIndex = Math.min(
    progress.completedChallenges.length,
    Math.max((pack?.challenges.length ?? 1) - 1, 0)
  );
  const currentIndex = pack?.challenges.findIndex((item) => item.id === challenge?.id) ?? 0;
  const locked = currentIndex > unlockedIndex;
  const answeredCount =
    challenge?.questions.filter((question) => selectedAnswers[question.id] !== undefined)
      .length ?? 0;
  const correctCount =
    challenge?.questions.filter(
      (question) => selectedAnswers[question.id] === question.answerIndex
    ).length ?? 0;
  const completionPercent = pack
    ? Math.round((progress.completedChallenges.length / pack.challenges.length) * 100)
    : 0;

  const chooseAnswer = (questionId: string, answerIndex: number) => {
    if (locked || completed) return;
    setSelectedAnswers((current) => ({ ...current, [questionId]: answerIndex }));
  };

  const completeChallenge = async () => {
    if (!pack || !challenge || locked || completed) return;
    if (correctCount < challenge.questions.length) {
      setFeedback("Almost. Answer every quiz question correctly to keep the streak.");
      playCue("focus");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/skills/${pack.courseSlug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.id, answers: selectedAnswers }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFeedback(data.error || "Could not save progress yet.");
      playCue("focus");
      return;
    }

    setProgress((current) => ({ ...current, ...data, authenticated: true, enrolled: true }));
    setFeedback(`+${challenge.points} points. Streak updated.`);
    playCue(challenge.audioCue || "complete");

    const next = pack.challenges[currentIndex + 1];
    if (next) window.setTimeout(() => setSelectedChallengeId(next.id), 650);
  };

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

  if (!pack || !challenge) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 pt-32 text-center sm:px-6">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-slate-300" />
          <h1 className="text-2xl font-semibold text-slate-950">
            No skill paths are published yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Add a `skillPack` to a published course to start rendering daily,
            gamified AI fluency challenges here.
          </p>
          <Link
            href="/courses"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
          >
            Browse courses <ArrowRight className="h-4 w-4" />
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Nav />
      <main className="pt-16">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Daily AI fluency
                </span>
                <span className="rounded-md bg-[#B8F56D] px-2.5 py-1 text-xs font-bold">
                  {pack.courseTitle}
                </span>
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                {pack.title}
              </h1>
              {pack.learnerPromise || pack.subtitle ? (
                <p className="mt-4 max-w-2xl text-[17px] leading-8 text-slate-700">
                  {pack.learnerPromise || pack.subtitle}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-2">
                <Metric icon={Flame} label={`${progress.streak} day streak`} />
                <Metric icon={Zap} label={`${progress.points} points`} />
                <Metric icon={Trophy} label={`${completionPercent}% complete`} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Skill scoreboard
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Your course-backed points and streak.
                  </p>
                </div>
                <Medal className="h-5 w-5 text-slate-500" />
              </div>
              <div className="mt-4 rounded-lg bg-white px-3 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">You</span>
                  <span className="text-slate-500">{progress.points} pts</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-950"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>
              {progressLoading ? (
                <p className="mt-3 text-xs text-slate-500">Syncing progress...</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            {packs.length > 1 ? (
              <label className="mb-4 block">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Skill path
                </span>
                <select
                  value={pack.courseSlug}
                  onChange={(event) => setSelectedSlug(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
                >
                  {packs.map((item) => (
                    <option key={item.courseSlug} value={item.courseSlug}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              Daily path
            </p>
            <div className="space-y-2">
              {pack.challenges.map((item, index) => {
                const itemCompleted = progress.completedChallenges.includes(item.id);
                const itemLocked = index > unlockedIndex;
                const active = item.id === challenge.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={itemLocked}
                    onClick={() => setSelectedChallengeId(item.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                      itemLocked && "cursor-not-allowed opacity-45"
                    )}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-black text-slate-950"
                      style={{ backgroundColor: item.accentColor || "#B8F56D" }}
                    >
                      {itemCompleted ? <CheckCircle2 className="h-4 w-4" /> : item.day}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {item.shortTitle || item.title}
                      </span>
                      <span
                        className={cn(
                          "block text-xs",
                          active ? "text-white/60" : "text-slate-500"
                        )}
                      >
                        {item.minutes} min · {item.points} pts
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <SkillChallengePanel
            challenge={challenge}
            selectedAnswers={selectedAnswers}
            completed={completed}
            locked={locked}
            saving={saving}
            feedback={feedback}
            answeredCount={answeredCount}
            correctCount={correctCount}
            authenticated={progress.authenticated}
            enrolled={progress.enrolled}
            courseSlug={pack.courseSlug}
            onAnswer={chooseAnswer}
            onComplete={completeChallenge}
          />
        </section>
      </main>
    </div>
  );
}

function SkillChallengePanel({
  challenge,
  selectedAnswers,
  completed,
  locked,
  saving,
  feedback,
  answeredCount,
  correctCount,
  authenticated,
  enrolled,
  courseSlug,
  onAnswer,
  onComplete,
}: {
  challenge: SkillChallenge;
  selectedAnswers: Record<string, number>;
  completed: boolean;
  locked: boolean;
  saving: boolean;
  feedback: string | null;
  answeredCount: number;
  correctCount: number;
  authenticated: boolean;
  enrolled: boolean;
  courseSlug: string;
  onAnswer: (questionId: string, answerIndex: number) => void;
  onComplete: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2.5 py-1 text-xs font-black"
                style={{ backgroundColor: challenge.accentColor || "#B8F56D" }}
              >
                Day {challenge.day}
              </span>
              <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                {challenge.minutes} minutes
              </span>
              <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">
                {challenge.points} points
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              {challenge.title}
            </h2>
            {challenge.hook ? (
              <p className="mt-3 text-[15px] leading-7 text-slate-700">
                {challenge.hook}
              </p>
            ) : null}
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="p-5">
              <p className="text-[15px] leading-8 text-slate-700">{challenge.lesson}</p>

              {challenge.keyIdeas.length > 0 ? (
                <div className="mt-6">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                    Key ideas
                  </p>
                  <div className="space-y-2">
                    {challenge.keyIdeas.map((idea) => (
                      <div
                        key={idea}
                        className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                      >
                        <Brain className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                        <span>{idea}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {challenge.microTask ? (
                <div className="mt-6 rounded-xl border border-[#A6E45E] bg-[#F3FFE4] p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-600">
                    Tiny task
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-800">
                    {challenge.microTask}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
              {challenge.assetUrl ? (
                <div className="relative aspect-[16/9] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:aspect-[4/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={challenge.assetUrl}
                    alt={challenge.assetAlt || ""}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-400 lg:aspect-[4/5]">
                  Dynamic asset URL not set
                </div>
              )}
            </div>
          </div>
        </article>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5 xl:self-start">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
            <Gauge className="h-4 w-4" />
            Platform evidence
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Skill paths can verify practical work through Agent Commons, Common OS,
            or another connected platform.
          </p>
          {challenge.practicalSignal ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <Radio className="h-4 w-4" />
                {challenge.practicalSignal.label}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Event: {challenge.practicalSignal.eventType}
              </p>
              {challenge.practicalSignal.description ? (
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {challenge.practicalSignal.description}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm leading-6 text-slate-600">
              Concept challenge. No external activity is required for this day.
            </div>
          )}
        </aside>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">
              Quick quiz
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {answeredCount}/{challenge.questions.length} answered · {correctCount} correct
            </p>
          </div>
          {completed ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#B8F56D] px-3 py-1.5 text-sm font-black text-slate-950">
              <BadgeCheck className="h-4 w-4" />
              Completed
            </span>
          ) : null}
        </div>

        <div className="space-y-4">
          {challenge.questions.map((question) => {
            const selected = selectedAnswers[question.id];
            const answered = selected !== undefined;
            const correct = selected === question.answerIndex;

            return (
              <div key={question.id} className="rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-950">{question.prompt}</p>
                <div className="mt-3 grid gap-2">
                  {question.options.map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      disabled={locked || completed}
                      onClick={() => onAnswer(question.id, index)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        selected === index
                          ? correct
                            ? "border-green-400 bg-green-50 text-green-900"
                            : "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        (locked || completed) && "cursor-default"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {answered ? (
                  <p
                    className={cn(
                      "mt-3 text-sm leading-6",
                      correct ? "text-green-700" : "text-rose-700"
                    )}
                  >
                    {correct
                      ? question.explanation || "Correct."
                      : "Not quite. Try that one again."}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!authenticated ? (
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              Sign in to save streak <ArrowRight className="h-4 w-4" />
            </Link>
          ) : !enrolled ? (
            <Link
              href={`/courses/${courseSlug}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              Enrol to save progress <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              disabled={locked || completed || saving || !answeredCount}
              onClick={onComplete}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {saving ? "Saving..." : "Complete daily skill"}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {feedback ? <p className="text-sm font-semibold text-slate-700">{feedback}</p> : null}
          {locked ? (
            <p className="text-sm text-slate-500">Finish earlier days to unlock this.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
}: {
  icon: typeof Flame;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
      <Icon className="h-4 w-4 text-slate-500" />
      {label}
    </span>
  );
}

function playCue(cue: SkillChallenge["audioCue"]) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const frequency = cue === "complete" ? 740 : cue === "spark" ? 620 : 440;

  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.18);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
