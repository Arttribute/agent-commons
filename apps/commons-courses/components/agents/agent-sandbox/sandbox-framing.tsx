"use client";

import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import type {
  AgentSandboxCompletionConfig,
  AgentSandboxIntroConfig,
} from "@/types/skills";

type SandboxIntroProps = {
  intro?: AgentSandboxIntroConfig;
  title?: string;
  brief?: string;
  onStart: () => void;
};

export function SandboxIntro({
  intro,
  title,
  brief,
  onStart,
}: SandboxIntroProps) {
  const expectations = intro?.expectations?.filter(Boolean) || [];
  return (
    <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-6">
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-500">
          <Info className="h-3.5 w-3.5" />
          {intro?.eyebrow || "Practice sandbox"}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          {intro?.title || title || "Build and test a real agent"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          {intro?.body ||
            brief ||
            "You will configure an Agent Commons agent, create it on the platform, then test it through a live chat interface."}
        </p>

        {intro?.infoBody ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <p className="font-black text-slate-950">
              {intro.infoTitle || "What is this sandbox?"}
            </p>
            <p className="mt-1">{intro.infoBody}</p>
          </div>
        ) : null}

        {expectations.length ? (
          <div className="mt-5 grid gap-2">
            {expectations.map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700"
              >
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-green-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onStart}
          className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white"
        >
          {intro?.startLabel || "Proceed to sandbox"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

export function SandboxCompletion({
  completion,
  creditReward,
  onContinue,
}: {
  completion?: AgentSandboxCompletionConfig;
  creditReward: number;
  onContinue?: () => void;
}) {
  return (
    <section className="rounded-xl border border-green-200 bg-white/95 p-3 text-left shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-slate-950">
            {completion?.title || "Agent sandbox complete"}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {completion?.body ||
              "Your agent was created, tested, and saved as part of this learning activity."}
          </p>
          {creditReward ? (
            <p className="mt-1.5 text-xs font-black text-slate-950">
              +{creditReward} credits queued
            </p>
          ) : null}
          {onContinue ? (
            <button
              type="button"
              onClick={onContinue}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-black text-white"
            >
              {completion?.primaryActionLabel || "Continue"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
