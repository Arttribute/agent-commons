import { ArrowUp, Bot, Paperclip } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";

/**
 * A quiet replica of /studio/agents: the fleet drifting around the launcher
 * composer. Deliberately static — no ReactFlow, no motion library, no data —
 * so the first carousel slide paints in the same frame as the page. Positions
 * are kept clear of the composer's footprint, exactly as the studio's layout
 * engine does at runtime.
 */
const FLEET = [
  { name: "Scout", top: 12, left: 6, size: 54, delay: 0 },
  { name: "Pilot", top: 2, left: 26, size: 44, delay: 1.1 },
  { name: "Vega", top: 4, left: 56, size: 46, delay: 0.4 },
  { name: "Atlas", top: 16, left: 80, size: 50, delay: 1.7 },
  { name: "Juno", top: 46, left: 90, size: 40, delay: 0.8 },
  { name: "Orion", top: 72, left: 76, size: 52, delay: 2.1 },
  { name: "Lyra", top: 80, left: 44, size: 44, delay: 1.4 },
  { name: "Nova", top: 68, left: 14, size: 48, delay: 0.2 },
  { name: "Echo", top: 44, left: 1, size: 42, delay: 2.4 },
];

export function FleetVisual() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-56 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/45 blur-3xl" />

      {FLEET.map((agent) => (
        <span
          key={agent.name}
          title={agent.name}
          className="absolute z-10 animate-float rounded-full bg-white p-[3px] shadow-card"
          style={{
            top: `${agent.top}%`,
            left: `${agent.left}%`,
            animationDelay: `${agent.delay}s`,
            animationDuration: "6s",
          }}
        >
          <AgentAvatar name={agent.name} size={agent.size} />
        </span>
      ))}

      {/* The launcher composer, centered exactly as it sits in the studio. */}
      <div className="absolute left-1/2 top-1/2 z-20 w-[360px] -translate-x-1/2 -translate-y-1/2">
        <p className="mb-3 text-center text-sm font-medium text-stone-700">
          What are we building today?
        </p>
        <div className="rounded-2xl border border-border bg-white p-3 shadow-composer">
          <p className="px-1 pb-6 pt-1 text-left text-sm text-muted-foreground">
            Ask an agent anything…
          </p>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-stone-600">
              <Bot className="h-3 w-3 text-stone-400" />
              Scout
            </span>
            <span className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 text-stone-400" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white">
                <ArrowUp className="h-3.5 w-3.5" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
