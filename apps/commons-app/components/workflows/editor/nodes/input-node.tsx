"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { ArrowDownToLine } from "lucide-react";

export interface InputNodeData {
  label: string;
  outputs?: Array<{ name: string; type: string }>;
}

export const InputNode = memo(({ data, selected }: NodeProps<InputNodeData>) => {
  const outputs = data.outputs || [{ name: "output", type: "any" }];

  return (
    <div
      className={`bg-background rounded-xl shadow-md min-w-[160px] border transition-all duration-150 ${
        selected ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg" : "border-emerald-200 hover:border-emerald-300 hover:shadow-lg"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-100">
        <div className="h-6 w-6 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
          <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
        </div>
        <p className="font-medium text-xs text-foreground truncate">
          {data.label || "Input"}
        </p>
      </div>

      {/* Output handles */}
      <div className="px-3 py-2 space-y-1.5">
        {outputs.map((output, idx) => (
          <div key={`output-${idx}`} className="flex items-center justify-end gap-2 relative">
            <span className="text-[11px] text-muted-foreground mr-1">{output.name}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={output.name}
              style={getHandleStyle(output.type)}
              className="!right-[-7px] !w-3 !h-3"
            />
          </div>
        ))}
      </div>
    </div>
  );
});

InputNode.displayName = "InputNode";
