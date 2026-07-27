"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronRight,
  GripVertical,
  Headphones,
  Globe2,
  FileCheck2,
  Loader2,
  Move,
  PackageCheck,
  RotateCcw,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImmersiveStage } from "@/components/experiences/immersive-stage";
import {
  evaluateExperienceScene,
  type ExperienceInteractionAnswer,
} from "@/lib/experience-evaluation";
import type {
  ExperienceDocument,
  ExperienceProgressDTO,
  ExperienceScene,
} from "@/types/experience";

type Props = {
  document: ExperienceDocument;
  courseSlug?: string;
  experienceId?: string;
  preview?: boolean;
  onClose?: () => void;
};

const emptyProgress = (document: ExperienceDocument): ExperienceProgressDTO => ({
  authenticated: false,
  currentSceneId: document.startSceneId,
  completedSceneIds: [],
  score: 0,
  attempts: {},
  completed: false,
});

export function ExperiencePlayer({
  document,
  courseSlug,
  experienceId,
  preview = false,
  onClose,
}: Props) {
  const [progress, setProgress] = useState(() => emptyProgress(document));
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    message: string;
  } | null>(null);
  const [pendingProgress, setPendingProgress] =
    useState<ExperienceProgressDTO | null>(null);
  const [loading, setLoading] = useState(!preview && Boolean(courseSlug && experienceId));
  const [submitting, setSubmitting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [shotState, setShotState] = useState({ sceneId: "", index: 0 });
  const scene = useMemo(
    () =>
      document.scenes.find((item) => item.id === progress.currentSceneId) ||
      document.scenes[0],
    [document.scenes, progress.currentSceneId],
  );
  const shotIndex = shotState.sceneId === scene?.id ? shotState.index : 0;
  const activeShot = scene?.shots?.[shotIndex];
  const character = document.characters.find(
    (item) =>
      item.id === (activeShot?.speakerCharacterId || scene?.characterId),
  );
  const sceneNumber = Math.max(
    1,
    document.scenes.findIndex((item) => item.id === scene?.id) + 1,
  );

  useEffect(() => {
    if (preview || !courseSlug || !experienceId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/courses/${courseSlug}/experiences/${experienceId}/progress`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ExperienceProgressDTO;
      })
      .then((next) => {
        if (!cancelled && next) setProgress(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseSlug, experienceId, preview]);

  async function act(
    answerId?: string,
    answer?: ExperienceInteractionAnswer,
  ) {
    if (!scene || submitting || pendingProgress) return;
    setSubmitting(true);
    setFeedback(null);

    if (!preview && courseSlug && experienceId) {
      const response = await fetch(
        `/api/courses/${courseSlug}/experiences/${experienceId}/progress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action:
            scene.type === "choice" ||
              scene.type === "world-map" ||
              scene.type === "quiz" ||
              scene.type === "hotspot" ||
              scene.type === "collect" ||
              scene.type === "sort" ||
              scene.type === "match" ||
              scene.type === "sequence" ||
              scene.type === "evidence"
                ? "answer"
                : "advance",
            sceneId: scene.id,
            answerId,
            answer,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | (ExperienceProgressDTO & { error?: string })
        | undefined;
      if (response.ok && data) {
        if (data.feedback) {
          setFeedback({
            correct: data.correct !== false,
            message: data.feedback,
          });
          if (data.correct !== false) {
            setPendingProgress(data);
          } else {
            setProgress(data);
          }
        } else {
          setProgress(data);
        }
        setSubmitting(false);
        return;
      }
      if (response.status !== 401) {
        setFeedback({
          correct: false,
          message: data?.error || "Progress could not be saved.",
        });
        setSubmitting(false);
        return;
      }
    }

    const local = evaluateExperienceScene(scene, answerId, answer);
    if (!local.correct) {
      setProgress((current) => ({
        ...current,
        attempts: {
          ...current.attempts,
          [scene.id]: (current.attempts[scene.id] || 0) + 1,
        },
      }));
      setFeedback({
        correct: false,
        message: scene.retryFeedback || "Try again.",
      });
      setSubmitting(false);
      return;
    }
    const nextProgress: ExperienceProgressDTO = {
      ...progress,
      currentSceneId: local.nextSceneId || scene.id,
      completedSceneIds: progress.completedSceneIds.includes(scene.id)
        ? progress.completedSceneIds
        : [...progress.completedSceneIds, scene.id],
      score:
        progress.score +
        (progress.completedSceneIds.includes(scene.id) ? 0 : scene.points || 0),
      attempts: {
        ...progress.attempts,
        [scene.id]: (progress.attempts[scene.id] || 0) + 1,
      },
      completed: scene.type === "completion" || !local.nextSceneId,
    };
    if (scene.successFeedback) {
      setFeedback({ correct: true, message: scene.successFeedback });
      setPendingProgress(nextProgress);
    } else {
      setProgress(nextProgress);
    }
    setSubmitting(false);
  }

  function reset() {
    setProgress(emptyProgress(document));
    setFeedback(null);
    setPendingProgress(null);
    if (!preview && courseSlug && experienceId) {
      void fetch(
        `/api/courses/${courseSlug}/experiences/${experienceId}/progress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset" }),
        },
      );
    }
  }

  function listen() {
    if (muted || !scene || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const spokenShot = scene.shots?.[shotIndex];
    const utterance = new SpeechSynthesisUtterance(
      `${spokenShot?.title || scene.title}. ${spokenShot?.body || scene.body}`,
    );
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }

  if (loading || !scene) {
    return (
      <div className="flex min-h-[520px] items-center justify-center bg-[#091421] text-white">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Preparing experience…
      </div>
    );
  }

  const progressPercent = Math.round(
    (progress.completedSceneIds.length / document.scenes.length) * 100,
  );
  const theme = document.theme;
  const atFinalBeat =
    !scene.shots?.length || shotIndex >= scene.shots.length - 1;
  const displayTitle = activeShot?.title || scene.title;
  const displayBody = activeShot?.body || scene.body;
  const panelMode = scene.interactionLayout || "panel";

  return (
    <div
      className="relative flex min-h-[640px] w-full flex-col overflow-hidden text-white lg:min-h-[720px]"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      <ImmersiveStage
        document={document}
        scene={scene}
        shot={activeShot}
        muted={muted}
      />
      <header className="relative z-[110] flex items-center gap-3 px-4 py-3 sm:px-6">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 shadow-xl backdrop-blur-xl hover:bg-slate-950/75"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        ) : courseSlug ? (
          <Link
            href={`/courses/${courseSlug}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 shadow-xl backdrop-blur-xl hover:bg-slate-950/75"
            aria-label="Back to course"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/48 px-4 py-2 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.15em]">
              {document.title}
            </p>
            <span className="text-[9px] font-bold text-white/45">
              {sceneNumber} / {document.scenes.length}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(progressPercent, 3)}%`,
                backgroundColor: theme.accent,
              }}
            />
          </div>
        </div>
        <span className="hidden rounded-full border border-white/15 bg-slate-950/55 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] shadow-xl backdrop-blur-xl sm:inline-flex">
          {preview ? "Preview" : `${progress.score} pts`}
        </span>
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-950/55 shadow-xl backdrop-blur-xl hover:bg-slate-950/75"
          aria-label={muted ? "Turn sound on" : "Mute sound"}
        >
          {muted ? (
            <Volume2 className="h-4 w-4 opacity-40" />
          ) : (
            <Headphones className="h-4 w-4" />
          )}
        </button>
      </header>

      <main
        className={cn(
          "relative z-[100] flex min-w-0 flex-1 px-4 pb-5 pt-24 sm:px-6 sm:pb-7",
          panelMode === "overlay"
            ? "items-end justify-center"
            : "items-end justify-end",
        )}
      >
        <div
          className={cn(
            "min-w-0 w-full",
            panelMode === "overlay"
              ? "max-w-5xl"
              : panelMode === "diegetic"
                ? "max-w-2xl lg:mr-[4vw]"
                : "max-w-xl lg:mr-[3vw]",
          )}
        >
          <section
            className={cn(
              "relative min-w-0 w-full max-w-full overflow-hidden border border-white/15 p-5 shadow-[0_30px_90px_rgba(0,0,0,.48)] backdrop-blur-2xl sm:p-7",
              panelMode === "overlay"
                ? "rounded-[1.6rem] bg-slate-950/72"
                : panelMode === "diegetic"
                  ? "rounded-[1.5rem] bg-slate-950/82 ring-1 ring-cyan-200/10"
                  : "rounded-[1.6rem] bg-slate-950/78",
            )}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <span
                className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ backgroundColor: theme.accentSoft, color: theme.background }}
              >
                {scene.eyebrow || `Scene ${sceneNumber}`}
              </span>
              {scene.shots?.length ? (
                <span className="flex items-center gap-1.5">
                  {scene.shots.map((shot, index) => (
                    <span
                      key={shot.id}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        index === shotIndex
                          ? "w-6 bg-white"
                          : "w-1.5 bg-white/25",
                      )}
                    />
                  ))}
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold leading-tight text-balance sm:text-4xl">
              {displayTitle}
            </h1>
            {character ? (
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-white/45">
                {character.name} · {character.role}
              </p>
            ) : null}
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/78 sm:text-base">
              {displayBody}
            </p>

            {atFinalBeat && scene.type === "explainer" && scene.mediaUrl ? (
              <MediaCard scene={scene} />
            ) : null}
            {atFinalBeat && scene.type === "hotspot" ? (
              <HotspotActivity
                scene={scene}
                disabled={submitting || Boolean(pendingProgress)}
                onSelect={(id) => void act(id)}
              />
            ) : null}
            {atFinalBeat && scene.type === "collect" ? (
              <CollectActivity
                key={scene.id}
                scene={scene}
                disabled={submitting || Boolean(pendingProgress)}
                onComplete={(answer) => void act(undefined, answer)}
              />
            ) : null}
            {atFinalBeat &&
            (scene.type === "sort" || scene.type === "match") ? (
              <SortMatchActivity
                key={scene.id}
                scene={scene}
                disabled={submitting || Boolean(pendingProgress)}
                onComplete={(answer) => void act(undefined, answer)}
              />
            ) : null}
            {atFinalBeat && scene.type === "sequence" ? (
              <SequenceActivity
                key={scene.id}
                scene={scene}
                disabled={submitting || Boolean(pendingProgress)}
                onComplete={(answer) => void act(undefined, answer)}
              />
            ) : null}
            {atFinalBeat && scene.type === "world-map" ? (
              <WorldMapActivity
                scene={scene}
                document={document}
                disabled={submitting || Boolean(pendingProgress)}
                onSelect={(id) => void act(id)}
              />
            ) : null}
            {atFinalBeat && scene.type === "evidence" ? (
              <EvidenceActivity
                key={scene.id}
                scene={scene}
                document={document}
                disabled={submitting || Boolean(pendingProgress)}
                onComplete={(answer) => void act(undefined, answer)}
              />
            ) : null}
            {atFinalBeat && scene.type === "choice" ? (
              <div className="mt-6 grid gap-3">
                {scene.choices?.map((choice, index) => (
                  <button
                    type="button"
                    key={choice.id}
                    disabled={submitting || Boolean(pendingProgress)}
                    onClick={() => void act(choice.id)}
                    className="group flex items-center gap-4 rounded-2xl border border-white/12 bg-white/[0.06] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 disabled:opacity-50"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
                      style={{ backgroundColor: theme.accent, color: theme.background }}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{choice.label}</span>
                      {choice.description ? (
                        <span className="mt-1 block text-xs leading-5 text-white/50">
                          {choice.description}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/35 transition group-hover:translate-x-1 group-hover:text-white" />
                  </button>
                ))}
              </div>
            ) : null}
            {atFinalBeat && scene.type === "quiz" ? (
              <div className="mt-6">
                <p className="mb-3 text-sm font-bold">{scene.prompt}</p>
                <div className="grid gap-2">
                  {scene.options?.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      disabled={submitting || Boolean(pendingProgress)}
                      onClick={() => void act(option.id)}
                      className="rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-left text-sm font-semibold transition hover:border-white/30 hover:bg-white/10 disabled:opacity-50"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {feedback ? (
              <div
                className={cn(
                  "mt-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold",
                  feedback.correct
                    ? "bg-emerald-400/15 text-emerald-100"
                    : "bg-rose-400/15 text-rose-100",
                )}
                role="status"
              >
                {feedback.correct ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                {feedback.message}
                {feedback.correct && pendingProgress ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProgress(pendingProgress);
                      setPendingProgress(null);
                      setFeedback(null);
                    }}
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-950"
                  >
                    Continue
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {(scene.type === "dialogue" ||
              scene.type === "explainer" ||
              scene.type === "completion") && (
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {scene.type === "completion" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void act()}
                      disabled={
                        submitting ||
                        Boolean(pendingProgress) ||
                        progress.completed
                      }
                      className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black disabled:opacity-50"
                      style={{ backgroundColor: theme.accent, color: theme.background }}
                    >
                      <Check className="h-4 w-4" />
                      {progress.completed ? "Completed" : "Complete quest"}
                    </button>
                    {progress.completed ? (
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Play again
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (scene.shots?.length && !atFinalBeat) {
                        setShotState({
                          sceneId: scene.id,
                          index: shotIndex + 1,
                        });
                      } else {
                        void act();
                      }
                    }}
                    disabled={submitting || Boolean(pendingProgress)}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black disabled:opacity-50"
                    style={{ backgroundColor: theme.accent, color: theme.background }}
                  >
                    {scene.shots?.length && !atFinalBeat
                      ? "Continue story"
                      : "Continue"}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={listen}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:bg-white/10"
                >
                  <Volume2 className="h-4 w-4" />
                  Listen
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function WorldMapActivity({
  scene,
  document,
  disabled,
  onSelect,
}: {
  scene: ExperienceScene;
  document: ExperienceDocument;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Globe2 className="h-4 w-4" />
        {scene.prompt || "Choose the next destination"}
      </p>
      <div className="relative min-h-72 overflow-hidden rounded-[1.5rem] border border-cyan-100/15 bg-[radial-gradient(circle_at_48%_42%,#357088_0,#173744_42%,#07141e_72%)] shadow-inner">
        <div className="absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/25 bg-[radial-gradient(circle_at_35%_30%,#7dc2b0_0,#326f68_28%,#173c52_58%,#071722_74%)] shadow-[inset_-30px_-20px_60px_rgba(0,0,0,.55),0_0_50px_rgba(100,230,255,.15)]">
          <div className="absolute inset-[14%] rounded-full border border-white/10" />
          <div className="absolute inset-[28%] rounded-full border border-white/10" />
        </div>
        {scene.choices?.map((choice) => {
          const location = document.world.locations.find(
            (candidate) => candidate.id === choice.locationId,
          );
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(choice.id)}
              className="group absolute -translate-x-1/2 -translate-y-1/2 text-left disabled:opacity-50"
              style={{
                left: `${location?.x ?? 50}%`,
                top: `${location?.y ?? 50}%`,
              }}
            >
              <span
                className="block h-4 w-4 rounded-full border-2 border-white bg-cyan-300 shadow-[0_0_0_7px_rgba(103,232,249,.16),0_0_18px_rgba(103,232,249,.8)] transition group-hover:scale-125"
                style={{ backgroundColor: location?.accent }}
              />
              <span className="absolute left-5 top-1/2 w-max max-w-40 -translate-y-1/2 rounded-lg border border-white/10 bg-slate-950/82 px-2.5 py-1.5 shadow-xl backdrop-blur">
                <span className="block text-[10px] font-black uppercase tracking-[0.12em]">
                  {location?.name || choice.label}
                </span>
                {choice.description ? (
                  <span className="mt-0.5 block text-[9px] leading-4 text-white/50">
                    {choice.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceActivity({
  scene,
  document,
  disabled,
  onComplete,
}: {
  scene: ExperienceScene;
  document: ExperienceDocument;
  disabled: boolean;
  onComplete: (answer: ExperienceInteractionAnswer) => void;
}) {
  const evidence = scene.evidence || [];
  const [current, setCurrent] = useState(0);
  const [decisions, setDecisions] = useState<
    Record<string, "approve" | "reject">
  >({});
  const item = evidence[current];
  if (!item) return null;
  const assetUrl = document.assets.find(
    (asset) => asset.id === item.assetId,
  )?.url;

  function decide(decision: "approve" | "reject") {
    setDecisions((values) => ({ ...values, [item.id]: decision }));
    if (current < evidence.length - 1) {
      window.setTimeout(() => setCurrent((value) => value + 1), 180);
    }
  }

  return (
    <div className="mt-6">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold">
        <FileCheck2 className="h-4 w-4" />
        {scene.prompt || "Verify the evidence"}
      </p>
      <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#f4efe4] text-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-900/10 px-4 py-3">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Record {current + 1} of {evidence.length}
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            {Object.keys(decisions).length} reviewed
          </span>
        </div>
        {item.imageUrl || assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl || assetUrl}
            alt=""
            className="max-h-44 w-full object-cover"
          />
        ) : null}
        <div className="p-5">
          <h3 className="text-lg font-black">{item.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            {item.summary}
          </p>
          {item.details ? (
            <p className="mt-3 rounded-xl bg-slate-900/[0.06] p-3 text-xs leading-5 text-slate-600">
              {item.details}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => decide("reject")}
              className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => decide("approve")}
              className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {evidence.map((record, index) => (
            <button
              type="button"
              key={record.id}
              onClick={() => setCurrent(index)}
              className={cn(
                "h-2 rounded-full transition-all",
                index === current
                  ? "w-6 bg-white"
                  : decisions[record.id]
                    ? "w-2 bg-emerald-300"
                    : "w-2 bg-white/25",
              )}
              aria-label={`Open record ${index + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={
            disabled || Object.keys(decisions).length !== evidence.length
          }
          onClick={() => onComplete({ decisions })}
          className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-35"
        >
          Submit verification
        </button>
      </div>
    </div>
  );
}

function MediaCard({ scene }: { scene: ExperienceScene }) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/15">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={scene.mediaUrl}
        alt={scene.mediaAlt || ""}
        className="max-h-64 w-full object-contain"
      />
    </div>
  );
}

function HotspotActivity({
  scene,
  disabled,
  onSelect,
}: {
  scene: ExperienceScene;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-bold">{scene.prompt}</p>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        {scene.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.mediaUrl}
            alt={scene.mediaAlt || ""}
            className="max-h-[360px] w-full object-contain"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/45">
            Add an inspection image
          </div>
        )}
        {scene.hotspots?.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            aria-label={hotspot.label}
            disabled={disabled}
            onClick={() => onSelect(hotspot.id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-white/10 shadow-[0_0_0_6px_rgba(255,255,255,0.12)] transition hover:scale-110 hover:bg-white/25"
            style={{
              left: `${hotspot.x}%`,
              top: `${hotspot.y}%`,
              width: `${hotspot.radius * 2}%`,
              aspectRatio: "1",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CollectActivity({
  scene,
  disabled,
  onComplete,
}: {
  scene: ExperienceScene;
  disabled: boolean;
  onComplete: (answer: ExperienceInteractionAnswer) => void;
}) {
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [collected, setCollected] = useState<string[]>([]);
  const items = scene.items || [];

  function discover(id: string) {
    setDiscovered((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }

  function collect(id: string) {
    if (!discovered.includes(id)) return;
    setCollected((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }

  return (
    <div className="mt-6">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Search className="h-4 w-4" />
        {scene.prompt}
      </p>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        {scene.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scene.mediaUrl}
            alt={scene.mediaAlt || ""}
            className="max-h-[380px] w-full object-contain"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/45">
            Add a discovery image
          </div>
        )}
        {items.map((item) => {
          const found = discovered.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled || found}
              onClick={() => discover(item.id)}
              className={cn(
                "absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 shadow-[0_0_0_7px_rgba(255,255,255,0.12)] transition",
                found
                  ? "border-emerald-200 bg-emerald-400 text-slate-950"
                  : "border-white/85 bg-black/25 text-white hover:scale-110 hover:bg-white/20",
              )}
              style={{ left: `${item.x}%`, top: `${item.y}%` }}
              aria-label={found ? `${item.label} found` : `Find ${item.label}`}
            >
              {found ? <Check className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
            Discovered
          </p>
          <div className="mt-2 flex min-h-16 flex-wrap gap-2">
            {discovered
              .filter((id) => !collected.includes(id))
              .map((id) => {
                const item = items.find((candidate) => candidate.id === id);
                if (!item) return null;
                return (
                  <button
                    key={item.id}
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        "application/x-experience-item",
                        item.id,
                      )
                    }
                    onClick={() => collect(item.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left text-xs font-bold hover:bg-white/15"
                    title="Drag to the field kit or select to collect"
                  >
                    <Move className="h-3.5 w-3.5 text-white/45" />
                    {item.label}
                  </button>
                );
              })}
            {!discovered.length ? (
              <span className="text-xs leading-5 text-white/35">
                Explore the image to reveal collectable evidence.
              </span>
            ) : null}
          </div>
        </div>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            collect(
              event.dataTransfer.getData(
                "application/x-experience-item",
              ),
            );
          }}
          className="rounded-2xl border border-dashed border-white/25 bg-white/[0.06] p-3"
        >
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
            <PackageCheck className="h-3.5 w-3.5" />
            Field kit
          </p>
          <div className="mt-2 flex min-h-16 flex-wrap gap-2">
            {collected.map((id) => {
              const item = items.find((candidate) => candidate.id === id);
              return item ? (
                <span
                  key={item.id}
                  className="rounded-xl bg-emerald-300 px-3 py-2 text-xs font-black text-slate-950"
                >
                  {item.label}
                </span>
              ) : null;
            })}
            {!collected.length ? (
              <span className="text-xs leading-5 text-white/35">
                Drag found items here. Selecting an item also works on touch.
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <button
        type="button"
        disabled={disabled || collected.length !== items.length}
        onClick={() => onComplete({ itemIds: collected })}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-35"
      >
        Submit field kit
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SortMatchActivity({
  scene,
  disabled,
  onComplete,
}: {
  scene: ExperienceScene;
  disabled: boolean;
  onComplete: (answer: ExperienceInteractionAnswer) => void;
}) {
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const items = scene.items || [];
  const zones = scene.zones || [];

  function place(itemId: string, zoneId: string) {
    if (!itemId) return;
    setPlacements((current) => ({ ...current, [itemId]: zoneId }));
    setSelected("");
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-bold">{scene.prompt}</p>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
          Cards
        </p>
        <div className="mt-2 flex min-h-14 flex-wrap gap-2">
          {items
            .filter((item) => !placements[item.id])
            .map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/x-experience-item",
                    item.id,
                  )
                }
                onClick={() => setSelected(item.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition",
                  selected === item.id
                    ? "border-white bg-white text-slate-950"
                    : "border-white/15 bg-white/10 hover:bg-white/15",
                )}
              >
                <GripVertical className="h-3.5 w-3.5 opacity-45" />
                {item.label}
              </button>
            ))}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => place(selected, zone.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              place(
                event.dataTransfer.getData(
                  "application/x-experience-item",
                ),
                zone.id,
              );
            }}
            className="min-h-28 rounded-2xl border border-dashed border-white/25 bg-white/[0.06] p-3 text-left transition hover:border-white/45 hover:bg-white/10"
          >
            <span className="block text-xs font-black">{zone.label}</span>
            {zone.description ? (
              <span className="mt-1 block text-[10px] leading-4 text-white/40">
                {zone.description}
              </span>
            ) : null}
            <span className="mt-3 flex flex-wrap gap-2">
              {items
                .filter((item) => placements[item.id] === zone.id)
                .map((item) => (
                  <span
                    key={item.id}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-950"
                  >
                    {item.label}
                  </span>
                ))}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={
          disabled || Object.keys(placements).length !== items.length
        }
        onClick={() => onComplete({ placements })}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-35"
      >
        Check {scene.type === "match" ? "matches" : "groups"}
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SequenceActivity({
  scene,
  disabled,
  onComplete,
}: {
  scene: ExperienceScene;
  disabled: boolean;
  onComplete: (answer: ExperienceInteractionAnswer) => void;
}) {
  const source = scene.items || [];
  const [order, setOrder] = useState(() => [...source].reverse());

  function move(fromId: string, toId: string) {
    if (!fromId || fromId === toId) return;
    setOrder((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === fromId);
      const to = next.findIndex((item) => item.id === toId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function nudge(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    setOrder((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-bold">{scene.prompt}</p>
      <div className="space-y-2">
        {order.map((item, index) => (
          <div
            key={item.id}
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData(
                "application/x-experience-item",
                item.id,
              )
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              move(
                event.dataTransfer.getData(
                  "application/x-experience-item",
                ),
                item.id,
              );
            }}
            className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.06] p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-950">
              {index + 1}
            </span>
            <GripVertical className="h-4 w-4 shrink-0 text-white/35" />
            <span className="min-w-0 flex-1 text-sm font-bold">
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => nudge(index, -1)}
              disabled={index === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 disabled:opacity-25"
              aria-label={`Move ${item.label} up`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => nudge(index, 1)}
              disabled={index === order.length - 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 disabled:opacity-25"
              aria-label={`Move ${item.label} down`}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || order.length < 2}
        onClick={() => onComplete({ order: order.map((item) => item.id) })}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-35"
      >
        Check sequence
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
