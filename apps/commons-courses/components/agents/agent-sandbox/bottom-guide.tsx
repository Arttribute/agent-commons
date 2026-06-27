import {
  CheckCircle2,
  ChevronRight,
  Coins,
  ExternalLink,
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
  canCreate: boolean;
  creating: boolean;
  createdAgentId?: string;
  needsGoogleConnection: boolean;
  googleConnectUrl: string;
  onOpenStep: () => void;
  onNextStep: () => void;
  onCreate: () => void;
};

export function BottomGuide({
  statusLabel,
  completed,
  creditReward,
  activeStep,
  guideIndex,
  guideLength,
  canCreate,
  creating,
  createdAgentId,
  needsGoogleConnection,
  googleConnectUrl,
  onOpenStep,
  onNextStep,
  onCreate,
}: BottomGuideProps) {
  return (
    <footer className="border-t border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            {completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Coins className="h-4 w-4 text-amber-500" />
            )}
            <span>{statusLabel}</span>
            {creditReward ? <span>+{creditReward} credits</span> : null}
          </div>
          {activeStep ? (
            <button
              type="button"
              onClick={onOpenStep}
              className="mt-1 flex max-w-3xl items-center gap-2 truncate text-left text-sm font-semibold text-slate-950"
            >
              <span className="shrink-0 text-xs text-slate-400">
                {guideIndex + 1}/{guideLength}
              </span>
              <span className="truncate">
                {activeStep.title}: {activeStep.body}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsGoogleConnection ? (
            <a
              href={googleConnectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Google
            </a>
          ) : null}
          {guideLength ? (
            <button
              type="button"
              onClick={onNextStep}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
            >
              Next
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            disabled={!canCreate || creating || Boolean(createdAgentId)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {createdAgentId ? "Created" : "Create agent"}
          </button>
        </div>
      </div>
    </footer>
  );
}
