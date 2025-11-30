"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { Download } from "lucide-react";

export interface InputNodeData {
  label: string;
  outputs?: Array<{ name: string; type: string }>;
}

export const InputNode = memo(({ data }: NodeProps<InputNodeData>) => {
  const outputs = data.outputs || [{ name: "output", type: "any" }];

  return (
    <div className="bg-white border-2 border-green-500 rounded-lg shadow-md min-w-[160px] hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 px-3 py-2 rounded-t-lg flex items-center gap-2">
        <Download className="h-4 w-4 text-white" />
        <p className="font-medium text-sm text-white truncate">
          {data.label || "Input"}
        </p>
      </div>

      {/* Output handles */}
      <div className="p-2">
        {outputs.map((output, idx) => (
          <div
            key={`output-${idx}`}
            className="flex items-center justify-end gap-2 mb-1 relative"
          >
            <span className="text-xs text-gray-700 mr-2">{output.name}</span>
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
    </div>
  );
});

InputNode.displayName = "InputNode";
