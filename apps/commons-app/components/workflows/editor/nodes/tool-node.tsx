"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { formatType, getTypeColor, WorkflowDataType } from "@/lib/workflows/type-mapping";

export interface ToolNodeData {
  label: string;
  toolName?: string;
  inputs?: Array<{ name: string; type: WorkflowDataType; required?: boolean }>;
  outputs?: Array<{ name: string; type: WorkflowDataType }>;
}

export const ToolNode = memo(({ data, selected }: NodeProps<ToolNodeData>) => {
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];

  return (
    <div
      className={`bg-background rounded-xl shadow-md min-w-[200px] border transition-all duration-150 ${
        selected ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-border hover:shadow-lg hover:border-border/80"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className="h-6 w-6 rounded-md bg-blue-100 flex items-center justify-center shrink-0">
          <Wrench className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <p className="font-medium text-xs text-foreground truncate flex-1">{data.label}</p>
      </div>

      {/* Input handles */}
      {inputs.length > 0 && (
        <div className="px-3 py-2 border-b border-border/60 space-y-1.5">
          {inputs.map((input, idx) => (
            <div key={`input-${idx}`} className="flex items-center gap-2 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={getHandleStyle(input.type)}
                className="!left-[-7px] !w-3 !h-3"
              />
              <span className="text-[11px] text-muted-foreground ml-1 flex-1 min-w-0 truncate">
                {input.name}
                {input.required && <span className="text-destructive ml-0.5">*</span>}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 h-4 shrink-0"
                style={{
                  backgroundColor: getTypeColor(input.type) + "18",
                  borderColor: getTypeColor(input.type) + "60",
                  color: getTypeColor(input.type),
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
        <div className="px-3 py-2 space-y-1.5">
          {outputs.map((output, idx) => (
            <div key={`output-${idx}`} className="flex items-center justify-end gap-2 relative">
              <Badge
                variant="outline"
                className="text-[10px] px-1 py-0 h-4 shrink-0"
                style={{
                  backgroundColor: getTypeColor(output.type) + "18",
                  borderColor: getTypeColor(output.type) + "60",
                  color: getTypeColor(output.type),
                }}
              >
                {formatType(output.type)}
              </Badge>
              <span className="text-[11px] text-muted-foreground mr-1 flex-1 text-right min-w-0 truncate">
                {output.name}
              </span>
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
      )}
    </div>
  );
});

ToolNode.displayName = "ToolNode";
