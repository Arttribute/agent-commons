"use client";

import { useCallback, useState, DragEvent } from "react";
import { Map } from "lucide-react";
import ReactFlow, {
  Background,
  ControlButton,
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
} from "@/lib/workflows/type-mapping";
import { StepNode } from "./nodes/step-node";
import { getNodeTheme } from "./nodes/node-theme";
import { ColoredEdge } from "./edges/colored-edge";
import { useToast } from "@/hooks/use-toast";
import type { WorkflowNodeType } from "@/types/workflow";

const nodeTypes = {
  tool: StepNode,
  agent_processor: StepNode,
  workflow: StepNode,
  condition: StepNode,
  transform: StepNode,
  loop: StepNode,
  human_approval: StepNode,
  input: StepNode,
  output: StepNode,
};

const edgeTypes = {
  colored: ColoredEdge,
};

function portsForNodeType(type: WorkflowNodeType) {
  switch (type) {
    case "input":
      return { inputs: [], outputs: [{ name: "value", type: "any" as const, required: false }] };
    case "output":
      return { inputs: [{ name: "value", type: "any" as const, required: false }], outputs: [] };
    case "agent_processor":
      return {
        inputs: [{ name: "data", type: "any" as const, required: false }],
        outputs: [{ name: "result", type: "object" as const }],
      };
    case "workflow":
      return {
        inputs: [{ name: "input", type: "any" as const, required: false }],
        outputs: [
          { name: "result", type: "object" as const },
          { name: "executionId", type: "string" as const },
        ],
      };
    case "condition":
      return {
        inputs: [{ name: "value", type: "any" as const, required: false }],
        outputs: [
          { name: "true", type: "boolean" as const },
          { name: "false", type: "boolean" as const },
        ],
      };
    case "transform":
      return {
        inputs: [{ name: "value", type: "any" as const, required: false }],
        outputs: [{ name: "result", type: "object" as const }],
      };
    case "loop":
      return {
        inputs: [{ name: "items", type: "array" as const, required: false }],
        outputs: [{ name: "results", type: "array" as const }],
      };
    case "human_approval":
      return {
        inputs: [{ name: "value", type: "any" as const, required: false }],
        outputs: [
          { name: "approved", type: "boolean" as const },
          { name: "approvalData", type: "object" as const },
        ],
      };
    case "tool":
    default:
      return { inputs: [], outputs: [] };
  }
}

export function WorkflowCanvas() {
  const { nodes, edges, setNodes, setEdges, addNode, updateNode } =
    useWorkflowStore();
  const { toast } = useToast();
  const [showMiniMap, setShowMiniMap] = useState(false);

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

      // Create colored edge — carries both port colors so the edge can
      // render a source→target gradient.
      const newEdge = {
        ...connection,
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        type: "colored",
        data: {
          dataType: sourceType,
          color: getEdgeColor(sourceType, targetType),
          sourceColor: getEdgeColor(sourceType),
          targetColor: getEdgeColor(targetType),
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

        const nodeType = (nodeData.nodeType || nodeData.type || "tool") as WorkflowNodeType;

        if (nodeType === "tool" && nodeData.schema) {
          // Extract typed parameters using the type mapping utility
          inputs = extractTypedParameters(nodeData.schema);

          // Extract output parameters (may include flattened object properties)
          outputs = extractOutputParameters(nodeData.schema);
        } else {
          const defaults = portsForNodeType(nodeType);
          inputs = defaults.inputs;
          outputs = defaults.outputs;
        }

        const newNode = {
          id: `${nodeType}-${Date.now()}`,
          type: nodeType,
          position,
          data: {
            label: nodeData.label,
            toolId: nodeData.toolId,
            toolName: nodeData.toolName,
            agentId: nodeData.agentId,
            workflowId: nodeData.workflowId,
            description: nodeData.description,
            inputs,
            outputs,
            nodeType,
            config: nodeData.config || {},
            schema: nodeData.schema,
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
    <div className="h-full w-full" onDrop={onDrop} onDragOver={onDragOver}>
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
        <Controls>
          <ControlButton
            onClick={() => setShowMiniMap((current) => !current)}
            title={showMiniMap ? "Hide minimap" : "Show minimap"}
            aria-pressed={showMiniMap}
          >
            <Map />
          </ControlButton>
        </Controls>
        {/* Hidden by default — toggled from the controls stack */}
        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => getNodeTheme(node.type).dot}
            position="bottom-right"
            style={{ width: 160, height: 110 }}
            pannable
            zoomable
          />
        )}
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
