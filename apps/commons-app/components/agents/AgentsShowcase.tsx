"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import Link from "next/link";
import { Check, CircleAlert, Hand, Loader2 } from "lucide-react";
import type { AgentRun } from "@/hooks/use-agent-activity";
import { cn } from "@/lib/utils";

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Rendered avatar footprint (w-16 + border/shadow) → radius used for spacing.
const AVATAR_RADIUS = 34;
// Breathing room kept between an avatar's edge and whatever it avoids.
const AVOID_MARGIN = 24;

interface Agent {
  agentId: string;
  name: string;
  avatar?: string;
  persona?: string;
  description?: string;
}

/** Position as percentages of the container (0–100). */
interface Position {
  top: number;
  left: number;
}

/**
 * We'll do a quick seeded shuffle for consistent positioning.
 */
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const newArray = [...array];
  let m = newArray.length;
  while (m) {
    const i = Math.floor(seededRandom(seed + m) * m);
    m--;
    [newArray[m], newArray[i]] = [newArray[i], newArray[m]];
  }
  return newArray;
}

interface Cell {
  row: number;
  col: number;
}

function generateAgentPositions(agents: Agent[]): Position[] {
  const numAgents = agents.length;
  if (!numAgents) return [];

  const columns = Math.ceil(Math.sqrt(numAgents));
  const rows = Math.ceil(numAgents / columns);

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      cells.push({ row, col });
    }
  }

  const shuffledCells = seededShuffle(cells, 42);

  return agents.map((_, index) => {
    const cell = shuffledCells[index];
    const cellWidthPercent = 100 / columns;
    const cellHeightPercent = 100 / rows;
    const baseLeft = cell.col * cellWidthPercent + cellWidthPercent / 2;
    const baseTop = cell.row * cellHeightPercent + cellHeightPercent / 2;
    const offsetX = (seededRandom(index) - 0.5) * cellWidthPercent * 0.5;
    const offsetY =
      (seededRandom(index + 1000) - 0.5) * cellHeightPercent * 0.5;

    return {
      top: baseTop + offsetY,
      left: baseLeft + offsetX,
    };
  });
}

/**
 * Nudges any avatar that would sit under `avoid` out along the line from the
 * avoid-box center to the avatar, just far enough to clear it (plus a margin).
 * Only overlapping avatars move, so the surrounding scatter stays organic — the
 * field simply opens up around the reserved element instead of drawing a hard
 * boundary.
 */
function avoidOverlap(
  base: Position[],
  container: DOMRect,
  avoid: DOMRect,
): Position[] {
  const cW = container.width;
  const cH = container.height;
  if (!cW || !cH) return base;

  // Reserved box in container-local pixels, grown by the avatar radius + margin
  // so we constrain avatar *centers*.
  const grow = AVATAR_RADIUS + AVOID_MARGIN;
  const left = avoid.left - container.left - grow;
  const right = avoid.right - container.left + grow;
  const top = avoid.top - container.top - grow;
  const bottom = avoid.bottom - container.top + grow;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const halfW = (right - left) / 2;
  const halfH = (bottom - top) / 2;
  if (halfW <= 0 || halfH <= 0) return base;

  return base.map((pos) => {
    const px = (pos.left / 100) * cW;
    const py = (pos.top / 100) * cH;
    const dx = px - cx;
    let dy = py - cy;

    // Outside the reserved box on either axis → leave it exactly where it is.
    if (Math.abs(dx) >= halfW || Math.abs(dy) >= halfH) return pos;

    // Centered avatars have no direction to travel; float them upward.
    if (dx === 0 && dy === 0) dy = -1;

    // Scale the (dx, dy) vector until it lands on the nearest box edge.
    const scale = Math.min(
      dx !== 0 ? halfW / Math.abs(dx) : Infinity,
      dy !== 0 ? halfH / Math.abs(dy) : Infinity,
    );
    let nx = cx + dx * scale;
    let ny = cy + dy * scale;

    // Keep the avatar fully inside the container.
    nx = Math.min(Math.max(nx, AVATAR_RADIUS), cW - AVATAR_RADIUS);
    ny = Math.min(Math.max(ny, AVATAR_RADIUS), cH - AVATAR_RADIUS);

    return { left: (nx / cW) * 100, top: (ny / cH) * 100 };
  });
}

function RunStateIcon({ run }: { run: AgentRun }) {
  if (run.state === "running") return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-label="Working" />;
  if (run.state === "awaiting_approval" || run.state === "awaiting_input") return <Hand className="h-3 w-3 shrink-0 text-amber-600" aria-label="Waiting for you" />;
  if (run.state === "failed") return <CircleAlert className="h-3 w-3 shrink-0 text-red-500" aria-label="Stopped" />;
  return <Check className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Done" />;
}

function runLabel(run: AgentRun) {
  if (run.state === "awaiting_approval") return "Needs approval";
  if (run.state === "awaiting_input") return "Waiting for you";
  return null;
}

export default function AgentsShowcase({
  agents = [],
  avoidRef,
  onAgentClick,
  activity = {},
}: {
  /** Recent runs per agent for the working indicator and hover list. */
  activity?: Record<string, AgentRun[]>;
  agents: Agent[];
  /**
   * Optional element the avatars should keep clear of (e.g. a centered
   * composer). When omitted, avatars scatter across the whole area as before.
   */
  avoidRef?: React.RefObject<HTMLElement | null>;
  onAgentClick: (agentId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const basePositions = useMemo(() => generateAgentPositions(agents), [agents]);
  const [positions, setPositions] = useState<Position[]>(basePositions);

  useIsomorphicLayoutEffect(() => {
    const recompute = () => {
      const container = containerRef.current;
      const avoid = avoidRef?.current;
      if (!container || !avoid) {
        setPositions(basePositions);
        return;
      }
      setPositions(
        avoidOverlap(
          basePositions,
          container.getBoundingClientRect(),
          avoid.getBoundingClientRect(),
        ),
      );
    };

    recompute();
    if (!avoidRef) return;

    const observer = new ResizeObserver(recompute);
    if (containerRef.current) observer.observe(containerRef.current);
    if (avoidRef.current) observer.observe(avoidRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [basePositions, avoidRef]);

  if (!agents.length) {
    return <p>No agents found. Create one!</p>;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-lg">
      {agents.map((agent, idx) => {
        const position = positions[idx] ?? basePositions[idx];
        if (!position) return null;
        return (
          <div
            key={agent.agentId || idx}
            className="absolute z-10 transition-[top,left] duration-500 ease-out"
            style={{
              top: `${position.top}%`,
              left: `${position.left}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <HoverCard openDelay={150}>
              <HoverCardTrigger asChild>
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: (idx % 5) * 0.2,
                  }}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onAgentClick(agent.agentId)}
                      className="w-16 h-16 rounded-full overflow-hidden shadow-md hover:shadow-xl transition p-0.5 border border-border z-20"
                      aria-label={agent.name}
                    >
                      <AgentAvatar
                        name={agent.name}
                        src={agent.avatar}
                        size={58}
                        bordered={false}
                      />
                    </button>
                    {(() => {
                      const runs = activity[agent.agentId] ?? [];
                      const waiting = runs.some((run) => run.state === "awaiting_approval" || run.state === "awaiting_input");
                      const working = runs.some((run) => run.state === "running");
                      if (!waiting && !working) return null;
                      return (
                        <span
                          className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white shadow-sm"
                          aria-label={waiting ? "Waiting for you" : "Working"}
                        >
                          {working && !waiting && <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-indigo-400/40" />}
                          <span className={cn("relative h-2 w-2 rounded-full", waiting ? "bg-amber-500" : "bg-indigo-500")} />
                        </span>
                      );
                    })()}
                  </div>
                </motion.div>
              </HoverCardTrigger>
              <HoverCardContent className="z-[1000] w-64 rounded-lg px-3 py-2 shadow-lg">
                <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
                {(activity[agent.agentId] ?? []).length ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {(activity[agent.agentId] ?? []).map((run) => (
                      <li key={run.sessionId}>
                        <Link
                          href={`/sessions/${encodeURIComponent(run.sessionId)}`}
                          className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted"
                        >
                          <span className="min-w-0 flex-1 truncate text-foreground/80">{run.title}</span>
                          {runLabel(run) && <span className="shrink-0 text-[10px] text-amber-700">{runLabel(run)}</span>}
                          <RunStateIcon run={run} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="w-full truncate text-xs text-muted-foreground">
                    {agent.persona || agent.description || "No description."}
                  </p>
                )}
              </HoverCardContent>
            </HoverCard>
          </div>
        );
      })}
    </div>
  );
}
