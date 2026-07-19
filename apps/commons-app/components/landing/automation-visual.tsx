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

const MASCOT = "/mascots/builder-point.png";

const nodes: Node[] = [
  {
    id: "gmail",
    type: "tool",
    position: { x: 0, y: 130 },
    data: {
      label: "New email",
      nodeType: "tool",
      toolName: "Gmail",
      outputs: [{ name: "email", type: "object" }],
    },
  },
  {
    id: "lead",
    type: "agent_processor",
    position: { x: 215, y: 130 },
    data: {
      label: "Lead plans",
      nodeType: "agent_processor",
      agentAvatar: MASCOT,
      inputs: [{ name: "data", type: "object" }],
      outputs: [{ name: "plan", type: "object" }],
    },
  },
  {
    id: "research",
    type: "agent_processor",
    position: { x: 440, y: 20 },
    data: {
      label: "Research",
      nodeType: "agent_processor",
      agentAvatar: MASCOT,
      inputs: [{ name: "brief", type: "object" }],
      outputs: [{ name: "findings", type: "object" }],
    },
  },
  {
    id: "writer",
    type: "agent_processor",
    position: { x: 440, y: 235 },
    data: {
      label: "Writer",
      nodeType: "agent_processor",
      agentAvatar: MASCOT,
      inputs: [{ name: "brief", type: "object" }],
      outputs: [{ name: "draft", type: "object" }],
    },
  },
  {
    id: "linear",
    type: "tool",
    position: { x: 665, y: 20 },
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
    position: { x: 665, y: 235 },
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
    id: "gmail-lead",
    source: "gmail",
    target: "lead",
    sourceHandle: "email",
    targetHandle: "data",
    type: "colored",
    data: green,
  },
  {
    id: "lead-research",
    source: "lead",
    target: "research",
    sourceHandle: "plan",
    targetHandle: "brief",
    type: "colored",
    data: green,
  },
  {
    id: "lead-writer",
    source: "lead",
    target: "writer",
    sourceHandle: "plan",
    targetHandle: "brief",
    type: "colored",
    data: green,
  },
  {
    id: "research-linear",
    source: "research",
    target: "linear",
    sourceHandle: "findings",
    targetHandle: "input",
    type: "colored",
    data: green,
  },
  {
    id: "writer-slack",
    source: "writer",
    target: "slack",
    sourceHandle: "draft",
    targetHandle: "input",
    type: "colored",
    data: green,
  },
];

/**
 * A free-flowing collage — no containing card — of the automation surface:
 * a multi-agent workflow wired into real tools, the editor's run chrome,
 * and the scheduled-tasks calendar floating alongside.
 */
export function AutomationVisual() {
  return (
    <div className="relative min-h-[560px] sm:min-h-[600px]">
      <div className="absolute left-[42%] top-[26%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/50 blur-3xl" />
      <div className="absolute bottom-[16%] right-[14%] h-32 w-32 rounded-full bg-brand-lilac/15 blur-3xl" />

      {/* Editor chrome — title + run button, straight from the workflow editor */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-floating backdrop-blur">
        <span className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium text-stone-800">
          <Workflow className="h-4 w-4 text-stone-500" />
          Launch ops
        </span>
        <span className="mx-0.5 h-5 w-px bg-stone-200" />
        <span className="flex h-9 items-center rounded-xl bg-stone-100 px-3 text-[11px] text-stone-600">
          3 agents · 3 tools
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-1 z-20 hidden items-center gap-1.5 rounded-xl bg-stone-950 px-3 py-2 text-[10px] font-medium text-white sm:flex">
        <Play className="h-3.5 w-3.5" /> Run workflow
      </div>

      {/* The canvas itself floats free on the page background */}
      <div className="absolute inset-x-0 top-10 h-[340px]">
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
            aria-label="Multi-agent workflow connected to tools"
          />
        </ReactFlowProvider>
      </div>

      <div className="pointer-events-none absolute left-1 top-[370px] z-20 flex items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 py-2 text-[10px] font-medium text-emerald-700 shadow-card backdrop-blur sm:top-[382px]">
        <Check className="h-3.5 w-3.5" /> 24 runs completed
      </div>

      {/* Scheduled tasks calendar, floating into the flow */}
      <div className="absolute inset-x-6 bottom-0 z-10 sm:inset-x-auto sm:right-0 sm:w-[380px]">
        <TasksVisual />
      </div>
    </div>
  );
}
