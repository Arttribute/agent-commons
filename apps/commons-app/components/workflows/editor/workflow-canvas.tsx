"use client";

import { useCallback, useMemo, DragEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { wouldCreateCycle } from "@/lib/workflows/workflow-validator";
import {
  getEdgeColor,
  validateTypeCompatibility,
} from "@/lib/workflows/type-colors";
import {
  extractTypedParameters,
  extractOutputParameters,
  mapJsonSchemaType,
} from "@/lib/workflows/type-mapping";
import { ToolNode } from "./nodes/tool-node";
import { InputNode } from "./nodes/input-node";
import { OutputNode } from "./nodes/output-node";
import { ColoredEdge } from "./edges/colored-edge";
import { useToast } from "@/hooks/use-toast";

const nodeTypes = {
  tool: ToolNode,
  input: InputNode,
  output: OutputNode,
};

const edgeTypes = {
  colored: ColoredEdge,
};

export function WorkflowCanvas() {
  const { nodes, edges, setNodes, setEdges, addNode, updateNode } =
    useWorkflowStore();
  const { toast } = useToast();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, nodes) as typeof nodes;
      setNodes(updatedNodes);
    },
    [nodes, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updatedEdges = applyEdgeChanges(changes, edges) as typeof edges;
      setEdges(updatedEdges);
    },
    [edges, setEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Check if would create a cycle
      if (
        wouldCreateCycle(nodes, edges, {
          source: connection.source,
          target: connection.target,
        })
      ) {
        toast({
          title: "Cannot connect",
          description: "This connection would create a cycle (loops are not allowed)",
          variant: "destructive",
        });
        return;
      }

      // Get source and target nodes
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) return;

      // Determine data type from handles
      let sourceType = "any";
      let targetType = "any";

      if (connection.sourceHandle && sourceNode.data.outputs) {
        const output = sourceNode.data.outputs.find(
          (o) => o.name === connection.sourceHandle
        );
        if (output) sourceType = output.type;
      }

      if (connection.targetHandle && targetNode.data.inputs) {
        const input = targetNode.data.inputs.find(
          (i) => i.name === connection.targetHandle
        );
        if (input) targetType = input.type;
      }

      // Validate type compatibility
      if (!validateTypeCompatibility(sourceType, targetType)) {
        toast({
          title: "Type mismatch",
          description: `Cannot connect ${sourceType} to ${targetType}`,
          variant: "destructive",
        });
        return;
      }

      // Create colored edge
      const newEdge = {
        ...connection,
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        type: "colored",
        data: {
          dataType: sourceType,
          color: getEdgeColor(sourceType, targetType),
        },
      };

      setEdges(addEdge(newEdge, edges) as typeof edges);
    },
    [nodes, edges, setEdges, toast]
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const data = event.dataTransfer.getData("application/reactflow");

      if (!data) return;

      try {
        const nodeData = JSON.parse(data);
        const position = {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        };

        // Extract inputs/outputs from schema if it's a tool
        let inputs: any[] = [];
        let outputs: any[] = [];

        if (nodeData.type === "tool" && nodeData.schema) {
          // Extract typed parameters using the type mapping utility
          inputs = extractTypedParameters(nodeData.schema);

          // Extract output parameters (may include flattened object properties)
          outputs = extractOutputParameters(nodeData.schema);
        } else if (nodeData.type === "input") {
          outputs = [{ name: "value", type: "any", required: false }];
        } else if (nodeData.type === "output") {
          inputs = [{ name: "value", type: "any", required: false }];
        }

        const newNode = {
          id: `${nodeData.type}-${Date.now()}`,
          type: nodeData.type,
          position,
          data: {
            label: nodeData.label,
            toolId: nodeData.toolId,
            toolName: nodeData.toolName,
            inputs,
            outputs,
            nodeType: nodeData.type,
            config: {},
          },
        };

        addNode(newNode);
      } catch (error) {
        console.error("Failed to add node:", error);
      }
    },
    [addNode]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeDragStop = useCallback(
    (_event: any, node: any) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode]
  );

  return (
    <div className="flex-1 h-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: "colored",
          animated: true,
        }}
      >
        <Background gap={15} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case "input":
                return "#10b981";
              case "output":
                return "#8b5cf6";
              case "tool":
                return "#3b82f6";
              default:
                return "#6b7280";
            }
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

// Export wrapped with ReactFlowProvider
export function WorkflowCanvasProvider() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}
