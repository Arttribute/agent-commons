import { cn } from "@/lib/utils";
import type { AgentRun } from "@/hooks/use-agent-activity";

/**
 * The quiet dot on an agent avatar: amber when it waits for you, a soft pulse
 * while it works. Finished and idle agents show nothing.
 */
export function RunStatusDot({ state, size = "md", className }: { state?: AgentRun["state"] | null; size?: "sm" | "md"; className?: string }) {
  const waiting = state === "awaiting_approval" || state === "awaiting_input";
  const working = state === "running";
  if (!waiting && !working) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute flex items-center justify-center rounded-full bg-white",
        size === "sm" ? "-bottom-px -right-px h-3 w-3" : "-bottom-0.5 -right-0.5 h-3.5 w-3.5",
        className,
      )}
      aria-label={waiting ? "Waiting for you" : "Working"}
      role="img"
    >
      {working && <span className={cn("absolute animate-ping rounded-full bg-indigo-400/40 motion-reduce:animate-none", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5")} />}
      <span className={cn("relative rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", waiting ? "bg-amber-500" : "bg-indigo-500")} />
    </span>
  );
}

export function runStatusLabel(run?: Pick<AgentRun, "state" | "actionUrl"> | null) {
  if (!run) return null;
  if (run.state === "awaiting_approval") return "Needs approval";
  if (run.state === "awaiting_input") return run.actionUrl ? "Open business" : "Waiting for you";
  if (run.state === "running") return "Working";
  if (run.state === "failed") return "Stopped";
  return null;
}
