"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  Flame,
  Loader2,
  Route,
  X,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { cn } from "@/lib/utils";
import type { CourseSkillPack, SkillChallenge } from "@/types/skills";

type Props = {
  slug: string;
};

type SkillProgress = {
  authenticated: boolean;
  enrolled: boolean;
  completedChallenges: string[];
  challengeAnswers: Record<string, number>;
  points: number;
  streak: number;
  longestStreak: number;
};

const emptyProgress: SkillProgress = {
  authenticated: false,
  enrolled: false,
  completedChallenges: [],
  challengeAnswers: {},
  points: 0,
  streak: 0,
  longestStreak: 0,
};

export default function SkillPathClient({ slug }: Props) {
  const pathname = usePathname();
  const [pack, setPack] = useState<CourseSkillPack | null>(null);
  const [progress, setProgress] = useState<SkillProgress>(emptyProgress);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [mode, setMode] = useState<"learn" | "quiz" | "done">("learn");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSkill() {
      setLoading(true);
      try {
        const [skillsRes, progressRes] = await Promise.all([
          fetch("/api/skills"),
          fetch(`/api/skills/${slug}/progress`),
        ]);
        const skillsData = (await skillsRes.json()) as { packs?: CourseSkillPack[] };
        const nextPack = skillsData.packs?.find((item) => item.courseSlug === slug) || null;
        const nextProgress = progressRes.ok
          ? ({ ...emptyProgress, ...((await progressRes.json()) as Partial<SkillProgress>) })
          : { ...emptyProgress, authenticated: progressRes.status !== 401 };

        if (cancelled) return;
        setPack(nextPack);
        setProgress(nextProgress);
        const firstOpen =
          nextPack?.challenges.find(
            (challenge) => !nextProgress.completedChallenges.includes(challenge.id)
          ) || nextPack?.challenges[0];
        setSelectedChallengeId(firstOpen?.id || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSkill();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const challenge = useMemo(
    () =>
      pack?.challenges.find((item) => item.id === selectedChallengeId) ||
      pack?.challenges[0],
    [pack, selectedChallengeId]
  );

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
    setQuestionIndex(0);
    setMode(progress.completedChallenges.includes(challenge.id) ? "done" : "learn");
    setFeedback(null);
  }, [challenge, progress.challengeAnswers, progress.completedChallenges]);

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
        <main className="mx-auto max-w-xl px-4 pt-32 text-center">
          <h1 className="text-xl font-semibold text-slate-950">Skill not found</h1>
          <Link href="/skills" className="mt-4 inline-flex text-sm font-bold text-slate-700">
            Back to skills
          </Link>
        </main>
      </div>
    );
  }

  const completed = progress.completedChallenges.includes(challenge.id);
  const unlockedIndex = Math.min(
    progress.completedChallenges.length,
    pack.challenges.length - 1
  );
  const currentIndex = pack.challenges.findIndex((item) => item.id === challenge.id);
  const locked = currentIndex > unlockedIndex;
  const completionPct = Math.round(
    (progress.completedChallenges.length / pack.challenges.length) * 100
  );

  const selectChallenge = (id: string) => {
    setSelectedChallengeId(id);
    setDrawerOpen(false);
  };

  const currentQuestion = challenge.questions[questionIndex];
  const selectedAnswer =
    currentQuestion && selectedAnswers[currentQuestion.id] !== undefined
      ? selectedAnswers[currentQuestion.id]
      : undefined;
  const currentCorrect =
    currentQuestion && selectedAnswer === currentQuestion.answerIndex;
  const allCorrect = challenge.questions.every(
    (question) => selectedAnswers[question.id] === question.answerIndex
  );

  const completeChallenge = async () => {
    if (!progress.authenticated) return;
    if (!allCorrect || saving || locked || completed) return;
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
    setMode("done");
    setFeedback(`+${challenge.points} points. Streak updated.`);
    playCue(challenge.audioCue || "complete");
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Nav />
      <main className="flex h-dvh flex-col overflow-hidden pt-16">
        <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Link
              href="/skills"
              className="hidden items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" />
              Skills
            </Link>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex rounded-lg border border-slate-200 p-2 text-slate-600 sm:hidden"
              aria-label="Open daily path"
            >
              <Route className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold uppercase tracking-widest text-slate-500">
                {pack.title}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-950"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Pill icon={Flame} label={String(progress.streak)} color="text-orange-500" />
              <Pill icon={Zap} label={String(progress.points)} color="text-sky-500" />
            </div>
          </div>
        </header>

        <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-cols-1 gap-0 sm:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-200 bg-slate-50 p-3 sm:block">
            <DailyPath
              pack={pack}
              progress={progress}
              selectedId={challenge.id}
              unlockedIndex={unlockedIndex}
              onSelect={selectChallenge}
            />
          </aside>

          <section className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="mx-auto flex min-h-full max-w-3xl flex-col">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    Day {challenge.day}
                  </p>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {challenge.title}
                  </h1>
                </div>
                {completed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#B8F56D] px-2.5 py-1 text-xs font-black">
                    <BadgeCheck className="h-4 w-4" />
                    Done
                  </span>
                ) : null}
              </div>

              {locked ? (
                <LockedState />
              ) : mode === "quiz" ? (
                <QuizView
                  challenge={challenge}
                  questionIndex={questionIndex}
                  selectedAnswer={selectedAnswer}
                  currentCorrect={Boolean(currentCorrect)}
                  selectedAnswers={selectedAnswers}
                  feedback={feedback}
                  saving={saving}
                  authenticated={progress.authenticated}
                  signInHref={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
                  onSelect={(answerIndex) => {
                    setSelectedAnswers((current) => ({
                      ...current,
                      [currentQuestion.id]: answerIndex,
                    }));
                    setFeedback(null);
                  }}
                  onPrevious={() => setQuestionIndex((index) => Math.max(index - 1, 0))}
                  onNext={() => {
                    if (selectedAnswer === undefined) return;
                    if (!currentCorrect) {
                      setFeedback("Not quite. Review the lesson and try again.");
                      playCue("focus");
                      return;
                    }
                    setFeedback(null);
                    if (questionIndex < challenge.questions.length - 1) {
                      setQuestionIndex((index) => index + 1);
                    } else {
                      completeChallenge();
                    }
                  }}
                />
              ) : mode === "done" ? (
                <DoneView
                  challenge={challenge}
                  feedback={feedback}
                  nextChallenge={pack.challenges[currentIndex + 1]}
                  onNext={(nextId) => selectChallenge(nextId)}
                />
              ) : (
                <LessonView
                  challenge={challenge}
                  authenticated={progress.authenticated}
                  signInHref={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
                  onStartQuiz={() => setMode("quiz")}
                />
              )}
            </div>
          </section>
        </div>
      </main>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            className="absolute inset-0 bg-black/30"
            aria-label="Close daily path"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[78dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-black text-slate-950">Daily path</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-slate-200 p-2 text-slate-600"
                aria-label="Close daily path"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DailyPath
              pack={pack}
              progress={progress}
              selectedId={challenge.id}
              unlockedIndex={unlockedIndex}
              onSelect={selectChallenge}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LessonView({
  challenge,
  authenticated,
  signInHref,
  onStartQuiz,
}: {
  challenge: SkillChallenge;
  authenticated: boolean;
  signInHref: string;
  onStartQuiz: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      {challenge.assetUrl ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={challenge.assetUrl}
            alt={challenge.assetAlt || ""}
            className="h-auto max-h-[44dvh] w-full object-contain"
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        {challenge.hook ? (
          <p className="mb-3 text-base font-semibold leading-7 text-slate-950">
            {challenge.hook}
          </p>
        ) : null}
        <p className="text-[15px] leading-7 text-slate-700">{challenge.lesson}</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {challenge.keyIdeas.map((idea) => (
          <div
            key={idea}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700"
          >
            {idea}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-4 flex flex-col gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:mt-auto sm:flex-row sm:items-center sm:justify-between sm:border-t-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        {!authenticated ? (
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            Sign in to save streak <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onStartQuiz}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            I am ready for the quiz <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function QuizView({
  challenge,
  questionIndex,
  selectedAnswer,
  currentCorrect,
  feedback,
  saving,
  authenticated,
  signInHref,
  onSelect,
  onPrevious,
  onNext,
}: {
  challenge: SkillChallenge;
  questionIndex: number;
  selectedAnswer?: number;
  currentCorrect: boolean;
  selectedAnswers: Record<string, number>;
  feedback: string | null;
  saving: boolean;
  authenticated: boolean;
  signInHref: string;
  onSelect: (answerIndex: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const question = challenge.questions[questionIndex];
  const isLast = questionIndex === challenge.questions.length - 1;
  const options = useMemo(
    () =>
      question.options
        .map((option, originalIndex) => ({ option, originalIndex }))
        .sort(
          (a, b) =>
            stableOptionRank(challenge.id, question.id, a.option, a.originalIndex) -
            stableOptionRank(challenge.id, question.id, b.option, b.originalIndex)
        ),
    [challenge.id, question.id, question.options]
  );

  return (
    <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Question {questionIndex + 1} of {challenge.questions.length}
        </p>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-950"
            style={{
              width: `${((questionIndex + 1) / challenge.questions.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <h2 className="text-xl font-semibold leading-8 text-slate-950">
        {question.prompt}
      </h2>
      <div className="mt-5 grid gap-3">
        {options.map(({ option, originalIndex }) => {
          const selected = selectedAnswer === originalIndex;
          return (
            <button
              key={`${question.id}:${originalIndex}`}
              type="button"
              onClick={() => onSelect(originalIndex)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm font-semibold leading-6 transition-colors",
                selected
                  ? currentCorrect
                    ? "border-green-400 bg-green-50 text-green-950"
                    : "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      {selectedAnswer !== undefined && currentCorrect ? (
        <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm leading-6 text-green-800">
          {question.explanation || "Correct."}
        </p>
      ) : null}
      {feedback ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
          {feedback}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 mt-auto flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-4 py-3 pt-3 backdrop-blur">
        <button
          type="button"
          onClick={onPrevious}
          disabled={questionIndex === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        {authenticated ? (
          <button
            type="button"
            onClick={onNext}
            disabled={selectedAnswer === undefined || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving..." : isLast ? "Finish" : "Next"}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href={signInHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

function DoneView({
  challenge,
  feedback,
  nextChallenge,
  onNext,
}: {
  challenge: SkillChallenge;
  feedback: string | null;
  nextChallenge?: SkillChallenge;
  onNext: (id: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#B8F56D]">
        <CheckCircle2 className="h-7 w-7 text-slate-950" />
      </div>
      <h2 className="text-2xl font-semibold text-slate-950">
        Daily challenge complete
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {feedback || `You earned ${challenge.points} points.`}
      </p>
      {nextChallenge ? (
        <button
          type="button"
          onClick={() => onNext(nextChallenge.id)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
        >
          Continue to next day <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <Link
          href="/skills"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white"
        >
          Back to skills <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function stableOptionRank(
  challengeId: string,
  questionId: string,
  option: string,
  index: number
) {
  const input = `${challengeId}:${questionId}:${option}:${index}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function DailyPath({
  pack,
  progress,
  selectedId,
  unlockedIndex,
  onSelect,
}: {
  pack: CourseSkillPack;
  progress: SkillProgress;
  selectedId: string;
  unlockedIndex: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
        Daily path
      </p>
      <div className="space-y-2">
        {pack.challenges.map((challenge, index) => {
          const completed = progress.completedChallenges.includes(challenge.id);
          const locked = index > unlockedIndex;
          const active = selectedId === challenge.id;
          return (
            <button
              key={challenge.id}
              type="button"
              disabled={locked}
              onClick={() => onSelect(challenge.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                active
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                locked && "cursor-not-allowed opacity-45"
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-black text-slate-950"
                style={{ backgroundColor: challenge.accentColor || "#B8F56D" }}
              >
                {completed ? <CheckCircle2 className="h-4 w-4" /> : challenge.day}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {challenge.shortTitle || challenge.title}
                </span>
                <span className={cn("block text-xs", active ? "text-white/60" : "text-slate-500")}>
                  {challenge.minutes} min · {challenge.points} pts
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LockedState() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
      <div>
        <p className="text-lg font-semibold text-slate-950">Locked for now</p>
        <p className="mt-2 text-sm text-slate-600">
          Finish the earlier daily challenges to unlock this one.
        </p>
      </div>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof Flame;
  label: string;
  color: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-800">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
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
