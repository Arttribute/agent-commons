"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import type { KnowledgeGraph } from "./types";

const FOLDER_COLORS = ["#99f6e4", "#bae6fd", "#ddd6fe", "#fde68a", "#fecdd3"];

export function KnowledgeGraphView({
  graph,
  selectedId,
  onSelect,
}: {
  graph: KnowledgeGraph;
  selectedId?: string;
  onSelect: (documentId: string) => void;
}) {
  const { nodes, edges, colorByFolder } = useMemo(() => {
    const folders = [
      ...new Set(graph.nodes.map((node) => node.folder || "Root")),
    ];
    const colorByFolder = new Map(
      folders.map((folder, index) => [
        folder,
        FOLDER_COLORS[index % FOLDER_COLORS.length],
      ]),
    );
    const grouped = new Map<string, typeof graph.nodes>();
    for (const node of graph.nodes) {
      const folder = node.folder || "Root";
      grouped.set(folder, [...(grouped.get(folder) || []), node]);
    }
    const flowNodes: Node[] = [];
    [...grouped.entries()].forEach(([folder, members], groupIndex) => {
      const centerAngle =
        (groupIndex / Math.max(1, grouped.size)) * Math.PI * 2;
      const groupRadius =
        grouped.size <= 1 ? 0 : Math.max(230, grouped.size * 64);
      const centerX = Math.cos(centerAngle) * groupRadius;
      const centerY = Math.sin(centerAngle) * groupRadius;
      members.forEach((member, index) => {
        const angle = (index / Math.max(1, members.length)) * Math.PI * 2;
        const radius =
          members.length <= 1 ? 0 : 90 + Math.min(90, members.length * 5);
        const active = member.id === selectedId;
        flowNodes.push({
          id: member.id,
          data: { label: member.title, folder },
          position: {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
          },
          style: {
            width: Math.max(112, Math.min(190, member.title.length * 7.4 + 30)),
            borderRadius: 10,
            border: active ? "1.5px solid #0f766e" : "1px solid #d6d3d1",
            background: active ? "#f0fdfa" : "#ffffff",
            color: "#1c1917",
            padding: "9px 12px",
            fontSize: 12,
            boxShadow: active
              ? "0 0 0 3px rgba(45, 212, 191, .16)"
              : "0 3px 12px rgba(28, 25, 23, .06)",
          },
        });
      });
    });
    const flowEdges: Edge[] = graph.edges
      .filter((edge) => edge.resolved && edge.target)
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target!,
        style: { stroke: "#a8a29e", strokeWidth: 1.2 },
      }));
    return { nodes: flowNodes, edges: flowEdges, colorByFolder };
  }, [graph, selectedId]);

  return (
    <div className="relative h-full min-h-[480px] overflow-hidden rounded-xl border bg-stone-50/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelect(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#d6d3d1" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!border-stone-200 !shadow-sm"
        />
        <MiniMap
          nodeColor={(node) =>
            colorByFolder.get(String(node.data?.folder)) || "#ccfbf1"
          }
          maskColor="rgba(250, 250, 249, .72)"
          className="!border !border-stone-200 !bg-white !shadow-sm"
        />
      </ReactFlow>
      {!nodes.length && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          Connected notes will appear here.
        </div>
      )}
    </div>
  );
}
