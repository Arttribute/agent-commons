"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  Headphones,
  Loader2,
  Network,
  Pause,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { stripRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import type {
  ContextualLearningView,
  LearnerProfileData,
  MindMapNode,
} from "@/types/learner-profile";
import { LearnerProfileDialog } from "./learner-profile-dialog";

type Props = {
  courseSlug: string;
  courseTitle: string;
  contentTitle: string;
  source: string;
  compact?: boolean;
};

type View = "original" | "context" | "mind_map";

export function LearningStudio({
  courseSlug,
  courseTitle,
  contentTitle,
  source,
  compact = false,
}: Props) {
  const [view, setView] = useState<View>("original");
  const [profile, setProfile] = useState<LearnerProfileData | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [context, setContext] = useState<ContextualLearningView | null>(null);
  const [mindMap, setMindMap] = useState<MindMapNode | null>(null);
  const [loading, setLoading] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [helpful, setHelpful] = useState(false);
  const plainSource = useMemo(() => stripRichTextHtml(source), [source]);
  const pathname = usePathname();
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`;

  useEffect(() => {
    fetch("/api/learner/profile")
      .then(async (res) => {
        setAuthenticated(res.status !== 401);
        return res.ok ? res.json() : null;
      })
      .then((data) => setProfile(data?.profile || null));
    const profileUpdated = (event: Event) => {
      setProfile((event as CustomEvent<LearnerProfileData>).detail);
      setContext(null);
    };
    window.addEventListener("learner-profile-updated", profileUpdated);
    return () => {
      window.removeEventListener("learner-profile-updated", profileUpdated);
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function selectView(nextView: View) {
    setView(nextView);
    setError("");
    if (nextView === "original") return;
    if (authenticated === false) return;
    if (nextView === "context" && !profile?.personalizationEnabled) return;
    if (
      (nextView === "context" && context) ||
      (nextView === "mind_map" && mindMap)
    ) {
      return;
    }

    setLoading(nextView);
    try {
      const res = await fetch("/api/learner/learning-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: nextView === "context" ? "contextual_example" : "mind_map",
          courseSlug,
          courseTitle,
          contentTitle,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create this learning view.");
        return;
      }
      if (nextView === "context") setContext(data.view);
      else setMindMap(data.view);
    } catch {
      setError("Could not create this learning view.");
    } finally {
      setLoading(null);
    }
  }

  function toggleAudio() {
    if (!("speechSynthesis" in window)) {
      setError("Read aloud is not supported by this browser.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      `${contentTitle}. ${plainSource}`,
    );
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
    void recordSignal("audio_started");
  }

  function markHelpful() {
    if (helpful) return;
    setHelpful(true);
    void recordSignal("learning_view_helpful");
  }

  return (
    <section
      className={cn(
        "mb-7 overflow-hidden rounded-2xl border border-slate-200 bg-white",
        compact && "mb-4 rounded-xl",
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            <Sparkles className="h-3.5 w-3.5" />
            Learn this your way
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            The original lesson always remains the source of truth.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <ViewButton
            active={view === "original"}
            label="Original"
            onClick={() => selectView("original")}
          />
          <ViewButton
            active={view === "context"}
            icon={SlidersHorizontal}
            label="My context"
            onClick={() => selectView("context")}
          />
          <ViewButton
            active={view === "mind_map"}
            icon={Network}
            label="Mind map"
            onClick={() => selectView("mind_map")}
          />
          <button
            type="button"
            onClick={toggleAudio}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
              speaking
                ? "bg-sky-50 text-sky-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            {speaking ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Headphones className="h-3.5 w-3.5" />
            )}
            {speaking ? "Stop" : "Listen"}
          </button>
        </div>
      </div>

      {view === "original" ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs leading-5 text-slate-500">
            You are reading the educator’s original content below.
          </p>
          {authenticated === false ? (
            <Link
              href={signInHref}
              className="shrink-0 px-2 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-950"
            >
              Sign in to personalize
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="shrink-0 px-2 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-950"
            >
              Preferences
            </button>
          )}
        </div>
      ) : null}

      {view !== "original" && authenticated === false ? (
        <div className="px-5 py-6 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-slate-400" />
          <h3 className="mt-2 text-sm font-bold text-slate-900">
            Save learning views to your profile
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Sign in to create mind maps, personalized examples, and guidance
            connected to your learning preferences.
          </p>
          <Link
            href={signInHref}
            className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
          >
            Sign in to continue
          </Link>
        </div>
      ) : null}

      {view === "context" &&
      authenticated !== false &&
      !profile?.personalizationEnabled ? (
        <div className="px-5 py-6 text-center">
          <SlidersHorizontal className="mx-auto h-5 w-5 text-slate-400" />
          <h3 className="mt-2 text-sm font-bold text-slate-900">
            Add just enough context to make examples familiar
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            Tell us your field, role, or goal. Personalization is optional and
            never replaces the educator’s lesson.
          </p>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="mt-4 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
          >
            {profile?.onboardingCompleted
              ? "Turn on personalization"
              : "Set up my context"}
          </button>
        </div>
      ) : null}

      {loading && authenticated !== false ? (
        <div className="flex items-center justify-center gap-2 px-5 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading === "mind_map"
            ? "Mapping the key ideas…"
            : "Connecting this to your context…"}
        </div>
      ) : null}

      {error ? (
        <p className="m-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {view === "context" && context && !loading && authenticated !== false ? (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
                Personalized learning aid
              </p>
              <h3 className="mt-1 text-base font-bold text-slate-950">
                {context.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Adjust
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {context.bridge}
          </p>
          <div className="mt-4 rounded-xl bg-sky-50/70 p-4 text-sm leading-7 text-slate-800">
            {context.example}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <LearningNote label="How it connects" value={context.connection} />
            <LearningNote label="Make it yours" value={context.tryIt} />
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-lg text-[11px] leading-5 text-slate-400">
              {context.fidelityNote}
            </p>
            <button
              type="button"
              onClick={markHelpful}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 text-xs font-bold",
                helpful ? "text-green-700" : "text-slate-500 hover:text-slate-900",
              )}
            >
              <Check className="h-3.5 w-3.5" />
              {helpful ? "Helpful" : "This helped"}
            </button>
          </div>
        </div>
      ) : null}

      {view === "mind_map" && mindMap && !loading && authenticated !== false ? (
        <MindMapView node={mindMap} onHelpful={markHelpful} helpful={helpful} />
      ) : null}

      <LearnerProfileDialog
        controlledOpen={profileOpen}
        onControlledOpenChange={setProfileOpen}
        onSaved={setProfile}
        showTrigger={false}
      />
    </section>
  );
}

function ViewButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: typeof Network;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
        active
          ? "bg-slate-950 text-white"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function LearningNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function MindMapView({
  node,
  helpful,
  onHelpful,
}: {
  node: MindMapNode;
  helpful: boolean;
  onHelpful: () => void;
}) {
  return (
    <div className="overflow-x-auto p-5">
      <div className="min-w-[720px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">
          Generated from the educator’s lesson
        </p>
        <div className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-bold text-white">
          {node.label}
          {node.detail ? (
            <span className="mt-1 block text-xs font-normal leading-5 text-white/60">
              {node.detail}
            </span>
          ) : null}
        </div>
        <div className="mx-auto h-5 w-px bg-slate-300" />
        <div
          className="relative grid gap-3 before:absolute before:left-[var(--mind-map-line-inset)] before:right-[var(--mind-map-line-inset)] before:top-0 before:h-px before:bg-slate-300"
          style={
            {
              gridTemplateColumns: `repeat(${Math.max(
                node.children?.length || 1,
                1,
              )}, minmax(0, 1fr))`,
              "--mind-map-line-inset": `${50 / Math.max(
                node.children?.length || 1,
                1,
              )}%`,
            } as CSSProperties
          }
        >
          {(node.children || []).map((child) => (
            <div key={child.id} className="relative pt-5">
              <div className="absolute left-1/2 top-0 h-5 w-px bg-slate-300" />
              <div className="h-full rounded-xl border border-slate-200 bg-white p-3 text-center">
                <p className="text-xs font-bold text-slate-900">{child.label}</p>
                {child.detail ? (
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {child.detail}
                  </p>
                ) : null}
                {child.children?.length ? (
                  <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                    {child.children.map((leaf) => (
                      <p
                        key={leaf.id}
                        className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600"
                      >
                        {leaf.label}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-400">
            A visual aid—not a replacement for the original lesson.
          </p>
          <button
            type="button"
            onClick={onHelpful}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-bold",
              helpful ? "text-green-700" : "text-slate-500 hover:text-slate-900",
            )}
          >
            <Check className="h-3.5 w-3.5" />
            {helpful ? "Helpful" : "This helped"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function recordSignal(
  signal: "audio_started" | "learning_view_helpful",
) {
  try {
    await fetch("/api/learner/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signal }),
    });
  } catch {
    // Preference signals should never interrupt learning.
  }
}
