"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
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
import { Popover } from "@/components/ui/popover";
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
  /** The educator's original content, always the source of truth. */
  children?: ReactNode;
};

type View = "original" | "context" | "mind_map";

/**
 * Ways to take in one piece of content. The control is a single quiet button;
 * the educator's original stays on screen until the learner asks for
 * something else.
 */
export function LearningStudio({
  courseSlug,
  courseTitle,
  contentTitle,
  source,
  children,
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
    if ((nextView === "context" && context) || (nextView === "mind_map" && mindMap)) return;

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
    const utterance = new SpeechSynthesisUtterance(`${contentTitle}. ${plainSource}`);
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

  const viewLabel = view === "context" ? "My context" : view === "mind_map" ? "Mind map" : "Original";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        {view === "original" ? (
          <span className="text-xs text-muted-foreground">
            {speaking ? "Reading aloud" : ""}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => selectView("original")}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back to the original
          </button>
        )}

        <Popover
          align="end"
          className="w-64 p-1.5"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted",
                view === "original" ? "bg-white text-stone-600" : "bg-accent text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">{view === "original" ? "Learn your way" : viewLabel}</span>
            </button>
          )}
        >
          {({ close }) => (
            <div>
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Show this as</p>
              <ModeRow
                active={view === "original"}
                label="The original lesson"
                onClick={() => {
                  selectView("original");
                  close();
                }}
              />
              <ModeRow
                active={view === "context"}
                icon={SlidersHorizontal}
                label="An example from my world"
                onClick={() => {
                  selectView("context");
                  close();
                }}
              />
              <ModeRow
                active={view === "mind_map"}
                icon={Network}
                label="A mind map"
                onClick={() => {
                  selectView("mind_map");
                  close();
                }}
              />
              <div className="mt-1 border-t border-border pt-1">
                <ModeRow
                  active={speaking}
                  icon={speaking ? Pause : Headphones}
                  label={speaking ? "Stop reading aloud" : "Read aloud"}
                  onClick={() => {
                    toggleAudio();
                    close();
                  }}
                />
                {authenticated === false ? (
                  <Link
                    href={signInHref}
                    onClick={close}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-stone-600 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Sign in to personalize
                  </Link>
                ) : (
                  <ModeRow
                    label="Learning preferences"
                    onClick={() => {
                      setProfileOpen(true);
                      close();
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </Popover>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {view === "original" ? children : null}

      {view !== "original" && authenticated === false ? (
        <Prompt
          icon={Sparkles}
          title="Sign in to build your own views"
          body="Mind maps and personalized examples are saved to your learning profile."
          action={
            <Link
              href={signInHref}
              className="inline-flex rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Sign in
            </Link>
          }
        />
      ) : null}

      {view === "context" && authenticated !== false && !profile?.personalizationEnabled ? (
        <Prompt
          icon={SlidersHorizontal}
          title="Tell us a little about your work"
          body="Your field, role or goal is enough to make examples familiar. It never replaces the educator's lesson."
          action={
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              {profile?.onboardingCompleted ? "Turn on personalization" : "Set up my context"}
            </button>
          }
        />
      ) : null}

      {loading && authenticated !== false ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading === "mind_map" ? "Mapping the key ideas" : "Connecting this to your context"}
        </div>
      ) : null}

      {view === "context" && context && !loading && authenticated !== false ? (
        <div>
          <h3 className="text-base font-medium text-foreground">{context.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{context.bridge}</p>
          <div className="mt-4 rounded-xl bg-muted p-4 text-sm leading-7 text-stone-800">
            {context.example}
          </div>
          <div className="mt-4 space-y-3">
            <LearningNote label="How it connects" value={context.connection} />
            <LearningNote label="Make it yours" value={context.tryIt} />
          </div>
          <Footnote note={context.fidelityNote} helpful={helpful} onHelpful={markHelpful} />
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
    </div>
  );
}

function ModeRow({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon?: typeof Network;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
        active ? "text-foreground" : "text-stone-600",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} /> : <span className="w-4" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
    </button>
  );
}

function Prompt({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Network;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

function Footnote({
  note,
  helpful,
  onHelpful,
}: {
  note?: string;
  helpful: boolean;
  onHelpful: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">{note}</p>
      <button
        type="button"
        onClick={onHelpful}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 text-xs",
          helpful ? "text-emerald-700" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
        {helpful ? "Helpful" : "This helped"}
      </button>
    </div>
  );
}

function LearningNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-6 text-stone-700">{value}</p>
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
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="rounded-xl bg-stone-900 px-4 py-3 text-center text-sm font-medium text-white">
            {node.label}
            {node.detail ? (
              <span className="mt-1 block text-xs font-normal leading-5 text-white/60">{node.detail}</span>
            ) : null}
          </div>
          <div className="mx-auto h-5 w-px bg-stone-300" />
          <div
            className="relative grid gap-3 before:absolute before:left-[var(--mind-map-line-inset)] before:right-[var(--mind-map-line-inset)] before:top-0 before:h-px before:bg-stone-300"
            style={
              {
                gridTemplateColumns: `repeat(${Math.max(node.children?.length || 1, 1)}, minmax(0, 1fr))`,
                "--mind-map-line-inset": `${50 / Math.max(node.children?.length || 1, 1)}%`,
              } as CSSProperties
            }
          >
            {(node.children || []).map((child) => (
              <div key={child.id} className="relative pt-5">
                <div className="absolute left-1/2 top-0 h-5 w-px bg-stone-300" />
                <div className="h-full rounded-xl border border-border bg-white p-3 text-center">
                  <p className="text-xs font-medium">{child.label}</p>
                  {child.detail ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{child.detail}</p>
                  ) : null}
                  {child.children?.length ? (
                    <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                      {child.children.map((leaf) => (
                        <p key={leaf.id} className="rounded-md bg-muted px-2 py-1.5 text-xs text-stone-600">
                          {leaf.label}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footnote
        note="A visual aid, not a replacement for the original lesson."
        helpful={helpful}
        onHelpful={onHelpful}
      />
    </div>
  );
}

async function recordSignal(signal: "audio_started" | "learning_view_helpful") {
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
