"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { Upload } from "lucide-react";

export interface OutputNodeData {
  label: string;
  inputs?: Array<{ name: string; type: string; required?: boolean }>;
}

export const OutputNode = memo(({ data }: NodeProps<OutputNodeData>) => {
  const inputs = data.inputs || [{ name: "input", type: "any" }];

  return (
    <div className="bg-white border-2 border-purple-500 rounded-lg shadow-md min-w-[160px] hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-3 py-2 rounded-t-lg flex items-center gap-2">
        <Upload className="h-4 w-4 text-white" />
        <p className="font-medium text-sm text-white truncate">
          {data.label || "Output"}
        </p>
      </div>

      {/* Input handles */}
      <div className="p-2">
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
            <span className="text-xs text-gray-700 ml-2">
              {input.name}
              {input.required && <span className="text-red-500 ml-1">*</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

OutputNode.displayName = "OutputNode";
