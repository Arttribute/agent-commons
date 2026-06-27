import {
  CheckCircle2,
  ChevronRight,
  Coins,
  Loader2,
  Play,
  Save,
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
  syncing: boolean;
  canSync: boolean;
  onOpenStep: () => void;
  onNextStep: () => void;
  onCreate: () => void;
  onSync: () => void;
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
  syncing,
  canSync,
  onOpenStep,
  onNextStep,
  onCreate,
  onSync,
}: BottomGuideProps) {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0 overflow-hidden">
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
              className="mt-1 flex w-full max-w-3xl items-center gap-2 text-left text-sm font-semibold text-slate-950"
            >
              <span className="shrink-0 text-xs text-slate-400">
                {guideIndex + 1}/{guideLength}
              </span>
              <span className="min-w-0 truncate">
                {activeStep.title}: {activeStep.body}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {guideLength ? (
            <button
              type="button"
              onClick={onNextStep}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
            >
              Next
            </button>
          ) : null}
          {!createdAgentId ? (
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate || creating}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Create agent
            </button>
          ) : null}
          {createdAgentId ? (
            <button
              type="button"
              onClick={onSync}
              disabled={!canSync || syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
