import { TypedParameter } from "./type-mapping";

export interface WorkflowInputSchema {
  parameters: TypedParameter[];
  startNodeId: string;
  startNodeLabel: string;
}

/**
 * Extract input schema from a workflow definition
 * Returns the parameters needed to execute the workflow
 */
export function extractWorkflowInputSchema(workflowDefinition: {
  nodes: any[];
  edges: any[];
  startNodeId?: string;
  endNodeId?: string;
}): WorkflowInputSchema | null {
  const { nodes, startNodeId } = workflowDefinition;

  if (!nodes || nodes.length === 0) {
    return null;
  }

  // Find the start node
  let startNode = startNodeId
    ? nodes.find((n) => n.id === startNodeId)
    : nodes.find((n) => n.type === "input") || nodes[0];

  if (!startNode) {
    return null;
  }

  // If start node is an input node, extract its schema
  if (startNode.type === "input") {
    return {
      parameters: [
        {
          name: "input",
          type: "any",
          required: true,
          description: "Workflow input value",
        },
      ],
      startNodeId: startNode.id,
      startNodeLabel: startNode.data?.label || "Input",
    };
  }

  // If start node is a tool, extract its input parameters
  if (startNode.type === "tool") {
    const inputs = startNode.data?.inputs || [];

    return {
      parameters: inputs.map((input: any) => ({
        name: input.name,
        type: input.type || "any",
        required: input.required || false,
        description: input.description,
      })),
      startNodeId: startNode.id,
      startNodeLabel: startNode.data?.label || "Start",
    };
  }

  // Default: single input parameter
  return {
    parameters: [
      {
        name: "input",
        type: "any",
        required: true,
        description: "Workflow input",
      },
    ],
    startNodeId: startNode.id,
    startNodeLabel: startNode.data?.label || startNode.type,
  };
}
