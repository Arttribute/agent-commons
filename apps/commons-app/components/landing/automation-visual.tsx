"use client";

import { Check, Play, Workflow } from "lucide-react";
import ReactFlow, {
  ReactFlowProvider,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { ColoredEdge } from "@/components/workflows/editor/edges/colored-edge";
import { StepNode } from "@/components/workflows/editor/nodes/step-node";
import { TasksVisual } from "@/components/landing/tasks-visual";

const nodeTypes = {
  tool: StepNode,
  agent_processor: StepNode,
};

const edgeTypes = { colored: ColoredEdge };

const nodes: Node[] = [
  {
    id: "gmail",
    type: "tool",
    position: { x: 0, y: 110 },
    data: {
      label: "New email",
      nodeType: "tool",
      toolName: "Gmail",
      outputs: [{ name: "email", type: "object" }],
    },
  },
  {
    id: "agent",
    type: "agent_processor",
    position: { x: 230, y: 110 },
    data: {
      label: "Scout triages",
      nodeType: "agent_processor",
      agentAvatar: "/mascots/builder-point.png",
      inputs: [{ name: "data", type: "object" }],
      outputs: [{ name: "result", type: "object" }],
    },
  },
  {
    id: "linear",
    type: "tool",
    position: { x: 470, y: 10 },
    data: {
      label: "Create issue",
      nodeType: "tool",
      toolName: "Linear",
      inputs: [{ name: "input", type: "object" }],
      outputs: [],
    },
  },
  {
    id: "slack",
    type: "tool",
    position: { x: 470, y: 205 },
    data: {
      label: "Share update",
      nodeType: "tool",
      toolName: "Slack",
      inputs: [{ name: "input", type: "object" }],
      outputs: [],
    },
  },
];

const green = {
  dataType: "object",
  color: "#22c55e",
  sourceColor: "#22c55e",
  targetColor: "#22c55e",
};

const edges: Edge[] = [
  {
    id: "gmail-agent",
    source: "gmail",
    target: "agent",
    sourceHandle: "email",
    targetHandle: "data",
    type: "colored",
    data: green,
  },
  {
    id: "agent-linear",
    source: "agent",
    target: "linear",
    sourceHandle: "result",
    targetHandle: "input",
    type: "colored",
    data: green,
  },
  {
    id: "agent-slack",
    source: "agent",
    target: "slack",
    sourceHandle: "result",
    targetHandle: "input",
    type: "colored",
    data: green,
  },
];

/**
 * A free-flowing collage of the automation surface: an agent workflow wired
 * into real tools with the editor's run chrome, and the scheduled-tasks
 * calendar tucked under the trigger to keep the composition compact.
 */
export function AutomationVisual() {
  return (
    <div className="relative min-h-[470px] sm:min-h-[490px]">
      <div className="absolute left-[46%] top-[28%] h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/50 blur-3xl" />
      <div className="absolute bottom-[18%] left-[16%] h-28 w-28 rounded-full bg-brand-lilac/15 blur-3xl" />

      <div className="pointer-events-none absolute left-0 top-0 z-20 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-floating backdrop-blur">
        <span className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium text-stone-800">
          <Workflow className="h-4 w-4 text-stone-500" />
          Support triage
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-1 z-20 hidden items-center gap-1.5 rounded-xl bg-stone-950 px-3 py-2 text-[10px] font-medium text-white sm:flex">
        <Play className="h-3.5 w-3.5" /> Run workflow
      </div>

      <div className="absolute inset-x-0 top-9 h-[300px]">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "colored" }}
            aria-label="Agent workflow connected to tools"
          />
        </ReactFlowProvider>
      </div>

      {/* Calendar sits under the trigger, filling the quiet lower-left corner */}
      <div className="absolute inset-x-4 bottom-0 z-10 sm:inset-x-auto sm:bottom-4 sm:left-0 sm:w-[310px]">
        <TasksVisual />
      </div>

      <div className="pointer-events-none absolute bottom-1 right-0 z-20 hidden items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 py-2 text-[10px] font-medium text-emerald-700 shadow-card backdrop-blur sm:flex">
        <Check className="h-3.5 w-3.5" /> 24 runs completed
      </div>
    </div>
  );
}
