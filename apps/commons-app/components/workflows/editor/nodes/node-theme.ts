import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  CheckSquare,
  GitBranch,
  Repeat2,
  Replace,
  Workflow,
  Wrench,
} from "lucide-react";

export interface NodeTheme {
  icon: LucideIcon;
  label: string;
  /** Pastel icon tile — dark icon on a soft wash, slide-deck style */
  tile: string;
  /** Small accent chip used in sidebars/panels */
  chip: string;
  /** Solid swatch for the canvas minimap */
  dot: string;
}

export const NODE_THEME: Record<string, NodeTheme> = {
  input: {
    icon: ArrowDownToLine,
    label: "Input",
    tile: "bg-emerald-200 text-emerald-950 dark:bg-emerald-300/25 dark:text-emerald-200",
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-300/15 dark:text-emerald-200",
    dot: "#34d399",
  },
  output: {
    icon: ArrowUpFromLine,
    label: "Output",
    tile: "bg-violet-200 text-violet-950 dark:bg-violet-300/25 dark:text-violet-200",
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-300/15 dark:text-violet-200",
    dot: "#a78bfa",
  },
  tool: {
    icon: Wrench,
    label: "Tool",
    tile: "bg-blue-200 text-blue-950 dark:bg-blue-300/25 dark:text-blue-200",
    chip: "bg-blue-100 text-blue-900 dark:bg-blue-300/15 dark:text-blue-200",
    dot: "#60a5fa",
  },
  agent_processor: {
    icon: Bot,
    label: "Agent",
    tile: "bg-cyan-200 text-cyan-950 dark:bg-cyan-300/25 dark:text-cyan-200",
    chip: "bg-cyan-100 text-cyan-900 dark:bg-cyan-300/15 dark:text-cyan-200",
    dot: "#22d3ee",
  },
  workflow: {
    icon: Workflow,
    label: "Workflow",
    tile: "bg-indigo-200 text-indigo-950 dark:bg-indigo-300/25 dark:text-indigo-200",
    chip: "bg-indigo-100 text-indigo-900 dark:bg-indigo-300/15 dark:text-indigo-200",
    dot: "#818cf8",
  },
  condition: {
    icon: GitBranch,
    label: "Condition",
    tile: "bg-amber-200 text-amber-950 dark:bg-amber-300/25 dark:text-amber-200",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-300/15 dark:text-amber-200",
    dot: "#fbbf24",
  },
  transform: {
    icon: Replace,
    label: "Transform",
    tile: "bg-pink-200 text-pink-950 dark:bg-pink-300/25 dark:text-pink-200",
    chip: "bg-pink-100 text-pink-900 dark:bg-pink-300/15 dark:text-pink-200",
    dot: "#f472b6",
  },
  loop: {
    icon: Repeat2,
    label: "Loop",
    tile: "bg-rose-200 text-rose-950 dark:bg-rose-300/25 dark:text-rose-200",
    chip: "bg-rose-100 text-rose-900 dark:bg-rose-300/15 dark:text-rose-200",
    dot: "#fb7185",
  },
  human_approval: {
    icon: CheckSquare,
    label: "Approval",
    tile: "bg-teal-200 text-teal-950 dark:bg-teal-300/25 dark:text-teal-200",
    chip: "bg-teal-100 text-teal-900 dark:bg-teal-300/15 dark:text-teal-200",
    dot: "#2dd4bf",
  },
};

export function getNodeTheme(type?: string): NodeTheme {
  return NODE_THEME[type ?? "tool"] ?? NODE_THEME.tool;
}
