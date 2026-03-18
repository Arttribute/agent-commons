"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { ArrowUpFromLine } from "lucide-react";

export interface OutputNodeData {
  label: string;
  inputs?: Array<{ name: string; type: string; required?: boolean }>;
}

export const OutputNode = memo(({ data, selected }: NodeProps<OutputNodeData>) => {
  const inputs = data.inputs || [{ name: "input", type: "any" }];

  return (
    <div
      className={`bg-background rounded-xl shadow-md min-w-[160px] border transition-all duration-150 ${
        selected ? "border-violet-500 ring-2 ring-violet-500/20 shadow-lg" : "border-violet-200 hover:border-violet-300 hover:shadow-lg"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-100">
        <div className="h-6 w-6 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
          <ArrowUpFromLine className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <p className="font-medium text-xs text-foreground truncate">
          {data.label || "Output"}
        </p>
      </div>

      {/* Input handles */}
      <div className="px-3 py-2 space-y-1.5">
        {inputs.map((input, idx) => (
          <div key={`input-${idx}`} className="flex items-center gap-2 relative">
            <Handle
              type="target"
              position={Position.Left}
              id={input.name}
              style={getHandleStyle(input.type)}
              className="!left-[-7px] !w-3 !h-3"
            />
            <span className="text-[11px] text-muted-foreground ml-1">
              {input.name}
              {input.required && <span className="text-destructive ml-0.5">*</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

OutputNode.displayName = "OutputNode";
