"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  Flame,
  Image as ImageIcon,
  Route,
  X,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { LoadingScreen } from "@/components/loading-screen";
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import { AgentLearnerSandbox } from "@/components/agents/agent-learner-sandbox";
import { LearningStudio } from "@/components/learning/learning-studio";
import { StageMedia, StudyShell } from "@/components/learning/study-shell";
import { cn } from "@/lib/utils";
import type { CourseSkillPack, SkillChallenge } from "@/types/skills";

type Props = {
  slug: string;
  initialPack: CourseSkillPack;
  initialProgress: SkillProgress | null;
};

type SkillProgress = {
  authenticated: boolean;
  enrolled: boolean;
  completedChallenges: string[];
  challengeAnswers: Record<string, number>;
  points: number;
  streak: number;
  longestStreak: number;
  practicalSignals?: Array<{ status: "pending" | "verified" }>;
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

export default function SkillPathClient({
  slug,
  initialPack,
  initialProgress,
}: Props) {
  const pathname = usePathname();
  const [pack] = useState<CourseSkillPack | null>(initialPack);
  const [progress, setProgress] = useState<SkillProgress>(
    initialProgress ?? emptyProgress,
  );
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [mode, setMode] = useState<"learn" | "quiz" | "done">("learn");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, number>
  >({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const confettiRef = useRef<ConfettiRef>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSkill() {
      const shouldRefresh =
        !initialProgress ||
        initialProgress.practicalSignals?.some(
          (signal) => signal.status === "pending",
        );
      if (!shouldRefresh) {
        const firstOpen =
          initialPack.challenges.find(
            (challenge) =>
              !(initialProgress ?? emptyProgress).completedChallenges.includes(
                challenge.id,
              ),
          ) || initialPack.challenges[0];
        setSelectedChallengeId((current) => current || firstOpen?.id || "");
        return;
      }

      setLoading(!initialProgress);
      try {
        const progressRes = await fetch(`/api/skills/${slug}/progress`);
        let nextProgress = progressRes.ok
          ? {
              ...emptyProgress,
              ...((await progressRes.json()) as Partial<SkillProgress>),
            }
          : { ...emptyProgress, authenticated: progressRes.status !== 401 };
        const hasPendingSignal = nextProgress.practicalSignals?.some(
          (signal) => signal.status === "pending",
        );
        if (
          progressRes.ok &&
          nextProgress.authenticated &&
          nextProgress.enrolled &&
          hasPendingSignal
        ) {
          const verifyRes = await fetch(`/api/skills/${slug}/verify`, {
            method: "POST",
          });
          if (verifyRes.ok) {
            const refreshed = await fetch(`/api/skills/${slug}/progress`);
            if (refreshed.ok) {
              nextProgress = {
                ...emptyProgress,
                ...((await refreshed.json()) as Partial<SkillProgress>),
              };
            }
          }
        }

        if (cancelled) return;
        setProgress(nextProgress);
        const firstOpen =
          initialPack.challenges.find(
            (challenge) =>
              !nextProgress.completedChallenges.includes(challenge.id),
          ) || initialPack.challenges[0];
        setSelectedChallengeId(firstOpen?.id || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSkill();
    return () => {
      cancelled = true;
    };
  }, [initialPack, initialProgress, slug]);

  const challenge = useMemo(
    () =>
      pack?.challenges.find((item) => item.id === selectedChallengeId) ||
      pack?.challenges[0],
    [pack, selectedChallengeId],
  );

  useEffect(() => {
    if (!challenge) return;
    const answers = Object.fromEntries(
      challenge.questions
        .map((question) => [
          question.id,
          progress.challengeAnswers[`${challenge.id}:${question.id}`],
        ])
        .filter(([, answer]) => answer !== undefined),
    ) as Record<string, number>;
    setSelectedAnswers(answers);
    setQuestionIndex(0);
    setMode(
      progress.completedChallenges.includes(challenge.id) ? "done" : "learn",
    );
    setFeedback(null);
  }, [challenge, progress.challengeAnswers, progress.completedChallenges]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <LoadingScreen
          title="Opening skill path"
          subtitle="Checking your latest progress."
        />
      </div>
    );
  }

  if (!pack || !challenge) {
    return (
      <div className="min-h-screen bg-white">
        <Nav />
        <main className="mx-auto max-w-xl px-4 pt-32 text-center">
          <h1 className="text-xl font-semibold text-slate-950">
            Skill not found
          </h1>
          <Link
            href="/skills"
            className="mt-4 inline-flex text-sm font-semibold text-slate-700"
          >
            Back to skills
          </Link>
        </main>
      </div>
    );
  }

  const completed = progress.completedChallenges.includes(challenge.id);
  const unlockedIndex = Math.min(
    progress.completedChallenges.length,
    pack.challenges.length - 1,
  );
  const currentIndex = pack.challenges.findIndex(
    (item) => item.id === challenge.id,
  );
  const locked = currentIndex > unlockedIndex;
  const isSandboxChallenge = !locked && Boolean(challenge.sandbox?.enabled);
  const completionPct = Math.round(
    (progress.completedChallenges.length / pack.challenges.length) * 100,
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
    (question) => selectedAnswers[question.id] === question.answerIndex,
  );

  const completeChallenge = async () => {
    if (!progress.authenticated) return;
    if (!allCorrect || saving || locked || completed) return;
    setSaving(true);
    const res = await fetch(`/api/skills/${pack.skillSlug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        answers: selectedAnswers,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFeedback(data.error || "Could not save progress yet.");
      playCue("focus");
      return;
    }

    setProgress((current) => ({
      ...current,
      ...data,
      authenticated: true,
      enrolled: true,
    }));
    setMode("done");
    setFeedback(`+${challenge.points} points. Streak updated.`);
    playCue(challenge.audioCue || "complete");
    celebrateChallenge(confettiRef.current, challenge.accentColor);
  };

  const completeSandboxChallenge = async (completion: {
    agentId?: string;
    simulated: boolean;
    creditReward: number;
  }) => {
    if (
      !progress.authenticated ||
      saving ||
      locked ||
      completed ||
      !challenge?.sandbox
    ) {
      return;
    }
    setSaving(true);
    const answers = Object.fromEntries(
      challenge.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    );
    const res = await fetch(`/api/skills/${pack.skillSlug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        answers,
        sandboxCompletion: completion,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFeedback(data.error || "Could not save sandbox progress yet.");
      playCue("focus");
      return;
    }

    setProgress((current) => ({
      ...current,
      ...data,
      authenticated: true,
      enrolled: true,
    }));
    setMode("done");
    const awardedCredits = data.creditGrant?.claim?.credits ?? 0;
    setFeedback(
      awardedCredits
        ? `Agent created. +${challenge.points} points and ${awardedCredits} credits.`
        : `Agent created. +${challenge.points} points.`,
    );
    playCue(challenge.audioCue || "complete");
    celebrateChallenge(confettiRef.current, challenge.accentColor);
  };

  const nextChallenge = pack.challenges[currentIndex + 1];
  const quizQuestionCount = challenge.questions.length;

  const footer = locked ? null : mode === "quiz" ? (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => setQuestionIndex((index) => Math.max(index - 1, 0))}
        disabled={questionIndex === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm text-stone-700 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        Back
      </button>
      {progress.authenticated ? (
        <button
          type="button"
          onClick={() => {
            if (selectedAnswer === undefined) return;
            if (!currentCorrect) {
              setFeedback("Not quite. Review the lesson and try again.");
              playCue("focus");
              return;
            }
            setFeedback(null);
            if (questionIndex < quizQuestionCount - 1) setQuestionIndex((index) => index + 1);
            else completeChallenge();
          }}
          disabled={selectedAnswer === undefined || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? "Saving" : questionIndex === quizQuestionCount - 1 ? "Finish" : "Next"}
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ) : (
        <Link
          href={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          Sign in <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </Link>
      )}
    </div>
  ) : mode === "done" ? (
    nextChallenge ? (
      <button
        type="button"
        onClick={() => selectChallenge(nextChallenge.id)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
      >
        Next day <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </button>
    ) : (
      <Link
        href="/skills"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
      >
        Back to skills <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </Link>
    )
  ) : !progress.authenticated ? (
    <Link
      href={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
    >
      Sign in to save your streak <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
    </Link>
  ) : challenge.questions.length ? (
    <button
      type="button"
      onClick={() => setMode("quiz")}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
    >
      Start the check <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
    </button>
  ) : (
    <button
      type="button"
      onClick={completeChallenge}
      disabled={saving}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
    >
      {saving ? "Saving" : "Complete lesson"} <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-page text-foreground">
      <Confetti ref={confettiRef} />
      <Nav />
      <div className="flex min-h-0 flex-1 flex-col pt-16">
        {isSandboxChallenge ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AgentLearnerSandbox
              key={challenge.id}
              courseSlug={pack.skillSlug}
              challengeId={challenge.id}
              config={challenge.sandbox!}
              completed={completed}
              authenticated={progress.authenticated}
              signInHref={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
              courseTitle={pack.title}
              challengeTitle={`Day ${challenge.day}: ${challenge.title}`}
              onComplete={completeSandboxChallenge}
              onExit={() => {
                window.location.href = "/skills";
              }}
              onContinue={
                nextChallenge
                  ? () => selectChallenge(nextChallenge.id)
                  : () => {
                      window.location.href = "/skills";
                    }
              }
            />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-4 py-2.5 sm:px-6">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open daily path"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-stone-600 lg:hidden"
              >
                <Route className="h-4 w-4" strokeWidth={1.75} />
                Day {challenge.day}
              </button>
              <Link
                href="/skills"
                className="hidden shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                Skills
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pack.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1 w-24 overflow-hidden rounded-full bg-muted sm:w-40">
                    <span
                      className="block h-full rounded-full bg-stone-800 transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progress.completedChallenges.length}/{pack.challenges.length}
                  </span>
                </div>
              </div>
              <span className="hidden items-center gap-2 sm:flex">
                <Pill icon={Flame} label={String(progress.streak)} color="text-orange-500" />
                <Pill icon={Zap} label={String(progress.points)} color="text-sky-500" />
              </span>
            </header>

            <StudyShell
              rail={
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  <DailyPath
                    pack={pack}
                    progress={progress}
                    selectedId={challenge.id}
                    unlockedIndex={unlockedIndex}
                    onSelect={selectChallenge}
                  />
                </div>
              }
              stage={
                challenge.assetUrl && mode !== "quiz"
                  ? [
                      {
                        key: "visual",
                        label: "Visual",
                        icon: ImageIcon,
                        node: <StageMedia src={challenge.assetUrl} alt={challenge.assetAlt} />,
                      },
                    ]
                  : []
              }
              contentLabel={mode === "quiz" ? "Check" : "Lesson"}
              contentWidth={challenge.assetUrl && mode !== "quiz" ? "wide" : "md"}
              contentHeader={
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">
                    {mode === "quiz"
                      ? `Question ${questionIndex + 1} of ${quizQuestionCount}`
                      : `Day ${challenge.day} · ${challenge.title}`}
                  </p>
                  {mode === "quiz" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("learn");
                        setFeedback(null);
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Back to lesson
                    </button>
                  ) : completed ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-emerald-700">
                      <BadgeCheck className="h-4 w-4" strokeWidth={1.75} /> Done
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{challenge.minutes} min</span>
                  )}
                </div>
              }
              footer={footer}
            >
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
                  onSelect={(answerIndex) => {
                    setSelectedAnswers((current) => ({
                      ...current,
                      [currentQuestion.id]: answerIndex,
                    }));
                    setFeedback(null);
                  }}
                />
              ) : mode === "done" ? (
                <DoneView challenge={challenge} feedback={feedback} />
              ) : (
                <LessonView challenge={challenge} courseSlug={pack.skillSlug} courseTitle={pack.title} />
              )}
            </StudyShell>
          </>
        )}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-stone-950/30"
            aria-label="Close daily path"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[78dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-floating">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Daily path</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-border p-2 text-stone-600"
                aria-label="Close daily path"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
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
  courseSlug,
  courseTitle,
}: {
  challenge: SkillChallenge;
  courseSlug: string;
  courseTitle: string;
}) {
  return (
    <LearningStudio
      courseSlug={courseSlug}
      courseTitle={courseTitle}
      contentTitle={challenge.title}
      source={[challenge.hook, challenge.lesson, ...challenge.keyIdeas].filter(Boolean).join("\n\n")}
    >
      <div>
        {challenge.hook ? (
          <p className="mb-4 text-base font-medium leading-7">{challenge.hook}</p>
        ) : null}
        <RichTextRenderer value={challenge.lesson} />
        {challenge.keyIdeas.length ? (
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted-foreground">Key ideas</p>
            <ul className="space-y-2">
              {challenge.keyIdeas.map((idea) => (
                <li key={idea} className="rounded-lg bg-muted px-3 py-2 text-sm leading-6 text-stone-700">
                  {idea}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </LearningStudio>
  );
}

function QuizView({
  challenge,
  questionIndex,
  selectedAnswer,
  currentCorrect,
  feedback,
  onSelect,
}: {
  challenge: SkillChallenge;
  questionIndex: number;
  selectedAnswer?: number;
  currentCorrect: boolean;
  selectedAnswers: Record<string, number>;
  feedback: string | null;
  onSelect: (answerIndex: number) => void;
}) {
  const question = challenge.questions[questionIndex];
  const options = useMemo(
    () =>
      question.options
        .map((option, originalIndex) => ({ option, originalIndex }))
        .sort(
          (a, b) =>
            stableOptionRank(challenge.id, question.id, a.option, a.originalIndex) -
            stableOptionRank(challenge.id, question.id, b.option, b.originalIndex),
        ),
    [challenge.id, question.id, question.options],
  );

  return (
    <div>
      <h2 className="text-lg font-medium leading-7">{question.prompt}</h2>
      <div className="mt-5 grid gap-2.5">
        {options.map(({ option, originalIndex }) => {
          const selected = selectedAnswer === originalIndex;
          return (
            <button
              key={`${question.id}:${originalIndex}`}
              type="button"
              onClick={() => onSelect(originalIndex)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left text-sm leading-6 transition-colors",
                selected
                  ? currentCorrect
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-stone-900 bg-stone-900 text-white"
                  : "border-border bg-white hover:bg-page",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {selectedAnswer !== undefined && currentCorrect ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-6 text-emerald-800">
          {question.explanation || "Correct."}
        </p>
      ) : null}
      {feedback ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">{feedback}</p>
      ) : null}
    </div>
  );
}

function DoneView({
  challenge,
  feedback,
}: {
  challenge: SkillChallenge;
  feedback: string | null;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-sm font-medium">Challenge complete</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {feedback || `You earned ${challenge.points} points.`}
          </p>
        </div>
      </div>
      <div className="mt-5">
        {challenge.hook ? (
          <p className="mb-3 text-base font-medium leading-7">{challenge.hook}</p>
        ) : null}
        <RichTextRenderer value={challenge.lesson} />
      </div>
    </div>
  );
}

function stableOptionRank(
  challengeId: string,
  questionId: string,
  option: string,
  index: number,
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
      <p className="mb-3 text-xs font-medium text-slate-500">
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
                locked && "cursor-not-allowed opacity-45",
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-slate-950"
                style={{ backgroundColor: challenge.accentColor || "#B8F56D" }}
              >
                {completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  challenge.day
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {challenge.shortTitle || challenge.title}
                </span>
                <span
                  className={cn(
                    "block text-xs",
                    active ? "text-white/60" : "text-slate-500",
                  )}
                >
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
    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-800">
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

function celebrateChallenge(
  confettiController: ConfettiRef | null,
  accentColor?: string,
) {
  if (!confettiController) return;

  const colors = [
    accentColor || "#B8F56D",
    "#38BDF8",
    "#F59E0B",
    "#F472B6",
    "#5EEAD4",
  ];

  confettiController.fire({
    particleCount: 70,
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.72 },
    colors,
  });
  confettiController.fire({
    particleCount: 70,
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.72 },
    colors,
  });
  window.setTimeout(() => {
    confettiController.fire({
      particleCount: 45,
      spread: 100,
      startVelocity: 28,
      origin: { x: 0.5, y: 0.45 },
      colors,
    });
  }, 180);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
