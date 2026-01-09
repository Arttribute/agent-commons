"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { Badge } from "@/components/ui/badge";
import { formatType, getTypeColor, WorkflowDataType } from "@/lib/workflows/type-mapping";

export interface ToolNodeData {
  label: string;
  toolName?: string;
  inputs?: Array<{ name: string; type: WorkflowDataType; required?: boolean }>;
  outputs?: Array<{ name: string; type: WorkflowDataType }>;
}

export const ToolNode = memo(({ data }: NodeProps<ToolNodeData>) => {
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];

  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg shadow-md min-w-[200px] hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 rounded-t-lg">
        <p className="font-medium text-sm text-white truncate">{data.label}</p>
      </div>

      {/* Input handles */}
      {inputs.length > 0 && (
        <div className="p-2 border-b">
          {inputs.map((input, idx) => (
            <div
              key={`input-${idx}`}
              className="flex items-center gap-2 mb-1 relative"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={getHandleStyle(input.type)}
                className="!left-[-6px]"
              />
              <span className="text-xs text-gray-700 ml-2 flex-1">
                {input.name}
                {input.required && <span className="text-red-500 ml-1">*</span>}
              </span>
              <Badge
                variant="outline"
                className="text-xs px-1 py-0"
                style={{
                  backgroundColor: getTypeColor(input.type) + "20",
                  borderColor: getTypeColor(input.type),
                }}
              >
                {formatType(input.type)}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Output handles */}
      {outputs.length > 0 && (
        <div className="p-2">
          {outputs.map((output, idx) => (
            <div
              key={`output-${idx}`}
              className="flex items-center justify-end gap-2 mb-1 relative"
            >
              <Badge
                variant="outline"
                className="text-xs px-1 py-0"
                style={{
                  backgroundColor: getTypeColor(output.type) + "20",
                  borderColor: getTypeColor(output.type),
                }}
              >
                {formatType(output.type)}
              </Badge>
              <span className="text-xs text-gray-700 mr-2 flex-1 text-right">
                {output.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                style={getHandleStyle(output.type)}
                className="!right-[-6px]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

ToolNode.displayName = "ToolNode";
