"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Loader2,
  Play,
} from "lucide-react";

type BottomGuideProps = {
  statusLabel: string;
  completed: boolean;
  creditReward: number;
  activeStep?: { title: string; body: string };
  guideIndex: number;
  guideLength: number;
  guideVisible: boolean;
  canCreate: boolean;
  creating: boolean;
  createdAgentId?: string;
  syncing: boolean;
  canSync: boolean;
  canFinish: boolean;
  finishing: boolean;
  onOpenStep: () => void;
  onPreviousStep: () => void;
  onNextStep: () => void;
  onToggleGuide: () => void;
  onCreate: () => void;
  onSync: () => void;
  onFinish: () => void;
};

export function BottomGuide({
  statusLabel,
  completed,
  creditReward,
  activeStep,
  guideIndex,
  guideLength,
  guideVisible,
  canCreate,
  creating,
  createdAgentId,
  syncing,
  canSync,
  canFinish,
  finishing,
  onOpenStep,
  onPreviousStep,
  onNextStep,
  onToggleGuide,
  onCreate,
  onSync,
  onFinish,
}: BottomGuideProps) {
  const isLast = guideIndex + 1 >= guideLength;

  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">
      {/* Row 1 — status + guide toggle */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {completed ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
          ) : (
            <Coins className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <span className="min-w-0 truncate text-xs font-bold text-slate-500">
            {statusLabel}
          </span>
          {creditReward ? (
            <span className="shrink-0 text-xs font-medium text-slate-400">
              reward eligible
            </span>
          ) : null}
        </div>
        {guideLength ? (
          <button
            type="button"
            onClick={onToggleGuide}
            className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            title={guideVisible ? "Hide guide" : "Show guide"}
            aria-label={guideVisible ? "Hide guide" : "Show guide"}
          >
            {guideVisible ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>

      {/* Row 2 — step info + action buttons */}
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {/* Step counter + title — truncates to give buttons room */}
        <div className="min-w-0 flex-1">
          {activeStep ? (
            <button
              type="button"
              onClick={onOpenStep}
              className="flex w-full min-w-0 items-center gap-1.5 text-left"
            >
              <span className="shrink-0 text-xs text-slate-400">
                {guideIndex + 1}/{guideLength}
              </span>
              <span className="min-w-0 truncate text-xs font-semibold text-slate-800">
                {activeStep.title}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            </button>
          ) : null}
        </div>

        {/* Actions — shrink-0 so they never get squeezed out */}
        <div className="flex shrink-0 items-center gap-1.5">
          {guideLength > 1 && guideIndex > 0 ? (
            <button
              type="button"
              onClick={onPreviousStep}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          ) : null}

          {guideLength && !guideVisible ? (
            <button
              type="button"
              onClick={onNextStep}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700"
            >
              {isLast ? "Review" : "Next"}
            </button>
          ) : null}

          {!createdAgentId ? (
            <button
              data-sandbox-target="create-agent"
              type="button"
              onClick={onCreate}
              disabled={!canCreate || creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {/* Short label on mobile, full label on sm+ */}
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create agent</span>
            </button>
          ) : null}

          {createdAgentId ? (
            <button
              type="button"
              onClick={onSync}
              disabled={!canSync || syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Save
            </button>
          ) : null}

          {createdAgentId ? (
            <button
              data-sandbox-target="finish-sandbox"
              type="button"
              onClick={onFinish}
              disabled={!canFinish || finishing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {finishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {/* Short label on mobile, full label on sm+ */}
              <span className="sm:hidden">Finish</span>
              <span className="hidden sm:inline">Finish sandbox</span>
            </button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
