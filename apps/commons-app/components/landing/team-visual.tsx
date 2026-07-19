"use client";

import { Users } from "lucide-react";
import ReactFlow, {
  Background,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { ColoredEdge } from "@/components/workflows/editor/edges/colored-edge";
import { StepNode } from "@/components/workflows/editor/nodes/step-node";

const nodeTypes = { agent_processor: StepNode };
const edgeTypes = { colored: ColoredEdge };

const nodes: Node[] = [
  {
    id: "lead",
    type: "agent_processor",
    position: { x: 20, y: 120 },
    data: {
      label: "Lead",
      nodeType: "agent_processor",
      agentAvatar: "/mascots/builder-point.png",
      outputs: [{ name: "task", type: "object" }],
    },
  },
  {
    id: "research",
    type: "agent_processor",
    position: { x: 330, y: 0 },
    data: {
      label: "Research",
      nodeType: "agent_processor",
      agentAvatar: "/mascots/builder-point.png",
      inputs: [{ name: "brief", type: "object" }],
      outputs: [{ name: "findings", type: "object" }],
    },
  },
  {
    id: "builder",
    type: "agent_processor",
    position: { x: 330, y: 125 },
    data: {
      label: "Builder",
      nodeType: "agent_processor",
      agentAvatar: "/mascots/builder-point.png",
      inputs: [{ name: "brief", type: "object" }],
      outputs: [{ name: "draft", type: "object" }],
    },
  },
  {
    id: "reviewer",
    type: "agent_processor",
    position: { x: 330, y: 250 },
    data: {
      label: "Reviewer",
      nodeType: "agent_processor",
      agentAvatar: "/mascots/builder-point.png",
      inputs: [{ name: "brief", type: "object" }],
      outputs: [{ name: "review", type: "object" }],
    },
  },
];

const edges: Edge[] = ["research", "builder", "reviewer"].map((target) => ({
  id: `lead-${target}`,
  source: "lead",
  target,
  sourceHandle: "task",
  targetHandle: "brief",
  type: "colored",
  data: {
    dataType: "object",
    color: "#22c55e",
    sourceColor: "#22c55e",
    targetColor: "#22c55e",
  },
}));

export function TeamVisual() {
  return (
    <div className="relative h-[430px] overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#fafaf9] shadow-[0_28px_80px_-44px_rgba(28,25,23,0.32)]">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          aria-label="Hierarchical agent team"
        >
          <Background color="#d6d3d1" gap={18} size={1} />
        </ReactFlow>
      </ReactFlowProvider>

      <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <Users className="h-4 w-4 text-stone-500" />
        <span className="text-xs font-semibold text-stone-800">
          Launch team
        </span>
        <span className="rounded-md bg-teal-200 px-1.5 py-0.5 text-[9px] font-semibold text-stone-800">
          4 agents
        </span>
      </div>
    </div>
  );
}
