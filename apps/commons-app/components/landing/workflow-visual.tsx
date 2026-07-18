"use client";

import { ArrowLeft, Check, Play, Save, Workflow } from "lucide-react";
import ReactFlow, {
  Background,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { ColoredEdge } from "@/components/workflows/editor/edges/colored-edge";
import { StepNode } from "@/components/workflows/editor/nodes/step-node";

const nodeTypes = {
  tool: StepNode,
  agent_processor: StepNode,
  condition: StepNode,
};

const edgeTypes = {
  colored: ColoredEdge,
};

const nodes: Node[] = [
  {
    id: "gmail",
    type: "tool",
    position: { x: 0, y: 105 },
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
    position: { x: 220, y: 105 },
    data: {
      label: "Scout triages",
      nodeType: "agent_processor",
      inputs: [{ name: "data", type: "object" }],
      outputs: [{ name: "result", type: "object" }],
    },
  },
  {
    id: "condition",
    type: "condition",
    position: { x: 440, y: 105 },
    data: {
      label: "Needs action?",
      nodeType: "condition",
      inputs: [{ name: "value", type: "object" }],
      outputs: [
        { name: "true", type: "boolean" },
        { name: "false", type: "boolean" },
      ],
    },
  },
  {
    id: "linear",
    type: "tool",
    position: { x: 680, y: 25 },
    data: {
      label: "Create issue",
      nodeType: "tool",
      toolName: "Linear",
      inputs: [{ name: "input", type: "boolean" }],
      outputs: [],
    },
  },
  {
    id: "slack",
    type: "tool",
    position: { x: 680, y: 190 },
    data: {
      label: "Notify support",
      nodeType: "tool",
      toolName: "Slack",
      inputs: [{ name: "input", type: "boolean" }],
      outputs: [],
    },
  },
];

const edges: Edge[] = [
  {
    id: "gmail-agent",
    source: "gmail",
    target: "agent",
    sourceHandle: "email",
    targetHandle: "data",
    type: "colored",
    data: {
      dataType: "object",
      color: "#22c55e",
      sourceColor: "#22c55e",
      targetColor: "#22c55e",
    },
  },
  {
    id: "agent-condition",
    source: "agent",
    target: "condition",
    sourceHandle: "result",
    targetHandle: "value",
    type: "colored",
    data: {
      dataType: "object",
      color: "#22c55e",
      sourceColor: "#22c55e",
      targetColor: "#22c55e",
    },
  },
  {
    id: "condition-linear",
    source: "condition",
    target: "linear",
    sourceHandle: "true",
    targetHandle: "input",
    type: "colored",
    data: {
      dataType: "boolean",
      color: "#f59e0b",
      sourceColor: "#f59e0b",
      targetColor: "#f59e0b",
    },
  },
  {
    id: "condition-slack",
    source: "condition",
    target: "slack",
    sourceHandle: "false",
    targetHandle: "input",
    type: "colored",
    data: {
      dataType: "boolean",
      color: "#f59e0b",
      sourceColor: "#f59e0b",
      targetColor: "#f59e0b",
    },
  },
];

export function WorkflowVisual() {
  return (
    <div className="relative h-[430px] overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#fafaf9] shadow-[0_28px_80px_-44px_rgba(28,25,23,0.35)] sm:h-[470px]">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
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
          aria-label="Support triage workflow"
        >
          <Background color="#d6d3d1" gap={18} size={1} />
        </ReactFlow>
      </ReactFlowProvider>

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500">
          <ArrowLeft className="h-4 w-4" />
        </span>
        <span className="flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-stone-800">
          <Workflow className="h-4 w-4 text-stone-500" />
          Support triage
        </span>
        <span className="mx-0.5 h-5 w-px bg-stone-200" />
        <span className="hidden h-9 items-center gap-1.5 rounded-xl bg-stone-100 px-3 text-[11px] font-medium text-stone-600 sm:flex">
          <Save className="h-3.5 w-3.5" /> Saved
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 py-2 text-[10px] font-medium text-emerald-700 shadow-lg backdrop-blur">
        <Check className="h-3.5 w-3.5" /> 24 runs completed
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-20 hidden items-center gap-1.5 rounded-xl bg-stone-950 px-3 py-2 text-[10px] font-medium text-white sm:flex">
        <Play className="h-3.5 w-3.5" /> Test workflow
      </div>
    </div>
  );
}
