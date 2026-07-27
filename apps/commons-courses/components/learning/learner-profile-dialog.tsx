"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  defaultLearnerProfile,
  learnerDomains,
  type LearnerDomain,
  type LearnerFormat,
  type LearnerGuidanceStyle,
  type LearnerProfileData,
} from "@/types/learner-profile";

type Props = {
  autoPrompt?: boolean;
  buttonLabel?: string;
  className?: string;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
  onSaved?: (profile: LearnerProfileData) => void;
  showTrigger?: boolean;
};

const domainLabels: Record<LearnerDomain, string> = {
  marketing: "Marketing",
  healthcare: "Healthcare",
  education: "Education",
  technology: "Technology",
  finance: "Finance",
  creative: "Creative work",
  operations: "Operations",
  other: "Something else",
};

const formatOptions: Array<{
  id: LearnerFormat;
  label: string;
  description: string;
}> = [
  { id: "examples", label: "Concrete examples", description: "See ideas in a familiar setting." },
  { id: "mind_maps", label: "Mind maps", description: "See how the ideas connect." },
  { id: "step_by_step", label: "Step by step", description: "Break practice into a sequence." },
  { id: "reflection", label: "Reflection", description: "Learn through prompts and recall." },
  { id: "audio", label: "Listen", description: "Hear lesson content read aloud." },
];

const guidanceOptions: Array<{
  id: LearnerGuidanceStyle;
  label: string;
  description: string;
}> = [
  {
    id: "coach_me",
    label: "Coach me",
    description: "Questions and hints before direct explanation.",
  },
  {
    id: "show_then_practice",
    label: "Show, then practise",
    description: "A model example followed by a small attempt.",
  },
  {
    id: "concise",
    label: "Keep it concise",
    description: "Short explanations and clear next actions.",
  },
];

export function LearnerProfileDialog({
  autoPrompt = false,
  buttonLabel = "Learning preferences",
  className,
  controlledOpen,
  onControlledOpenChange,
  onSaved,
  showTrigger = true,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<LearnerProfileData>(
    defaultLearnerProfile,
  );
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onControlledOpenChange) onControlledOpenChange(next);
      else setInternalOpen(next);
    },
    [onControlledOpenChange],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/learner/profile")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.profile) return;
        setProfile(data.profile);
        setLoaded(true);
        if (autoPrompt && !data.profile.onboardingCompleted) setOpen(true);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [autoPrompt, setOpen]);

  async function save() {
    setSaving(true);
    setError("");
    const nextProfile = {
      ...profile,
      onboardingCompleted: true,
    };
    try {
      const res = await fetch("/api/learner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextProfile),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save your preferences.");
        return;
      }
      setProfile(data.profile);
      setOpen(false);
      setStep(0);
      onSaved?.(data.profile);
      window.dispatchEvent(
        new CustomEvent("learner-profile-updated", { detail: data.profile }),
      );
    } catch {
      setError("Could not save your preferences.");
    } finally {
      setSaving(false);
    }
  }

  function toggleFormat(format: LearnerFormat) {
    setProfile((current) => ({
      ...current,
      preferredFormats: current.preferredFormats.includes(format)
        ? current.preferredFormats.filter((item) => item !== format)
        : [...current.preferredFormats, format],
    }));
  }

  if (!loaded && !open) return null;

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50",
            className,
          )}
        >
          <Settings2 className="h-4 w-4" />
          {buttonLabel}
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/30 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="learning-profile-title"
        >
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close learning preferences"
            onClick={() => setOpen(false)}
          />
          <section className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Your learning profile
                </p>
                <h2
                  id="learning-profile-title"
                  className="mt-1 text-lg font-bold text-slate-950"
                >
                  Make learning feel more familiar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-5 py-5 sm:px-6">
              <div className="mb-6 flex gap-2" aria-label={`Step ${step + 1} of 2`}>
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      item <= step ? "bg-slate-950" : "bg-slate-100",
                    )}
                  />
                ))}
              </div>

              {step === 0 ? (
                <div>
                  <h3 className="text-base font-bold text-slate-950">
                    What should examples connect to?
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Share only what is useful. We use this to add optional
                    context—not to change the educator’s lesson.
                  </p>
                  <label className="mt-5 block text-xs font-bold text-slate-700">
                    Your role or current context
                    <input
                      value={profile.roleOrContext}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          roleOrContext: event.target.value,
                        }))
                      }
                      placeholder="e.g. Brand manager, nursing student"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal outline-none focus:border-slate-400"
                    />
                  </label>
                  <div className="mt-5">
                    <p className="text-xs font-bold text-slate-700">Field</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {learnerDomains.map((domain) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() =>
                            setProfile((current) => ({
                              ...current,
                              domain:
                                current.domain === domain ? "" : domain,
                            }))
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                            profile.domain === domain
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {domainLabels[domain]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="mt-5 block text-xs font-bold text-slate-700">
                    What are you hoping to do with what you learn?
                    <input
                      value={profile.goals[0] || ""}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          goals: event.target.value ? [event.target.value] : [],
                        }))
                      }
                      placeholder="e.g. Build a useful agent for my team"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal outline-none focus:border-slate-400"
                    />
                  </label>
                  <label className="mt-5 block text-xs font-bold text-slate-700">
                    Things you enjoy or relate to
                    <input
                      value={profile.interests.join(", ")}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          interests: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean)
                            .slice(0, 6),
                        }))
                      }
                      placeholder="e.g. football, storytelling, community projects"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm font-normal outline-none focus:border-slate-400"
                    />
                    <span className="mt-1 block text-[11px] font-normal text-slate-400">
                      Optional · separate with commas
                    </span>
                  </label>
                </div>
              ) : (
                <div>
                  <h3 className="text-base font-bold text-slate-950">
                    How should your copilot guide you?
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Choose any formats you enjoy. You can switch views inside a
                    lesson at any time.
                  </p>
                  <label className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-3">
                    <span>
                      <span className="block text-sm font-bold text-slate-900">
                        Personalize examples
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        Use the context you shared for optional examples and
                        copilot guidance.
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={profile.personalizationEnabled}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          personalizationEnabled: event.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                  </label>
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    {formatOptions.map((format) => {
                      const selected = profile.preferredFormats.includes(format.id);
                      return (
                        <button
                          key={format.id}
                          type="button"
                          onClick={() => toggleFormat(format.id)}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-3 text-left",
                            selected
                              ? "border-slate-950 bg-slate-50"
                              : "border-slate-200 bg-white",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                              selected
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-300",
                            )}
                          >
                            {selected ? <Check className="h-3 w-3" /> : null}
                          </span>
                          <span>
                            <span className="block text-sm font-bold text-slate-900">
                              {format.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                              {format.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-5 space-y-2">
                    {guidanceOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setProfile((current) => ({
                            ...current,
                            guidanceStyle: option.id,
                          }))
                        }
                        className={cn(
                          "w-full rounded-xl border px-4 py-3 text-left",
                          profile.guidanceStyle === option.id
                            ? "border-slate-950"
                            : "border-slate-200",
                        )}
                      >
                        <span className="text-sm font-bold text-slate-900">
                          {option.label}
                        </span>
                        <span className="ml-2 text-xs text-slate-500">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <input
                      type="checkbox"
                      checked={profile.allowUsageLearning}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          allowUsageLearning: event.target.checked,
                        }))
                      }
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">
                        Improve from how I use learning views
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        Remember view usage and helpful marks. We do not infer
                        sensitive traits, and you can turn this off.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {error ? (
                <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}
            </div>

            <footer className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Optional and editable
                </span>
              )}
              {step === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setProfile((current) => ({
                      ...current,
                      personalizationEnabled:
                        current.personalizationEnabled ||
                        Boolean(
                          current.domain ||
                            current.roleOrContext ||
                            current.customContext,
                        ),
                    }));
                    setStep(1);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save my preferences"}
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
