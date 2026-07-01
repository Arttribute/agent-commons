"use client";

import { memo } from "react";
import type { ElementType } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  Bot,
  CheckSquare,
  GitBranch,
  Hourglass,
  Repeat2,
  Replace,
  Workflow,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { formatType, getTypeColor, WorkflowDataType } from "@/lib/workflows/type-mapping";
import type { WorkflowNodeType } from "@/types/workflow";

interface StepNodeData {
  label: string;
  description?: string;
  nodeType?: WorkflowNodeType;
  inputs?: Array<{ name: string; type: WorkflowDataType; required?: boolean }>;
  outputs?: Array<{ name: string; type: WorkflowDataType }>;
}

const nodePresentation: Record<
  string,
  { icon: ElementType; color: string; background: string; label: string }
> = {
  tool: { icon: Wrench, color: "text-blue-600", background: "bg-blue-50", label: "Tool" },
  agent_processor: { icon: Bot, color: "text-cyan-700", background: "bg-cyan-50", label: "Agent processor" },
  workflow: { icon: Workflow, color: "text-indigo-700", background: "bg-indigo-50", label: "Workflow invocation" },
  condition: { icon: GitBranch, color: "text-amber-700", background: "bg-amber-50", label: "Condition" },
  transform: { icon: Replace, color: "text-fuchsia-700", background: "bg-fuchsia-50", label: "Transform" },
  loop: { icon: Repeat2, color: "text-rose-700", background: "bg-rose-50", label: "Loop" },
  human_approval: { icon: CheckSquare, color: "text-emerald-700", background: "bg-emerald-50", label: "Human approval" },
};

export const StepNode = memo(({ data, selected }: NodeProps<StepNodeData>) => {
  const nodeType = data.nodeType || "tool";
  const presentation = nodePresentation[nodeType] ?? nodePresentation.tool;
  const Icon = presentation.icon;
  const inputs = data.inputs || [];
  const outputs = data.outputs || [];

  return (
    <div
      className={`min-w-[220px] rounded-lg border bg-background shadow-sm transition-all duration-150 ${
        selected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "border-border hover:border-foreground/25"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${presentation.background}`}>
          <Icon className={`h-3.5 w-3.5 ${presentation.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{data.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{presentation.label}</p>
        </div>
      </div>

      {inputs.length > 0 && (
        <div className="space-y-1.5 border-b border-border/60 px-3 py-2">
          {inputs.map((input, index) => (
            <div key={`${input.name}-${index}`} className="relative flex items-center gap-2">
              <Handle
                type="target"
                position={Position.Left}
                id={input.name}
                style={getHandleStyle(input.type)}
                className="!left-[-7px] !h-3 !w-3"
              />
              <span className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {input.name}
                {input.required && <span className="ml-0.5 text-destructive">*</span>}
              </span>
              <Badge
                variant="outline"
                className="h-4 shrink-0 px-1 py-0 text-[10px]"
                style={{
                  backgroundColor: `${getTypeColor(input.type)}18`,
                  borderColor: `${getTypeColor(input.type)}60`,
                  color: getTypeColor(input.type),
                }}
              >
                {formatType(input.type)}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {outputs.length > 0 && (
        <div className="space-y-1.5 px-3 py-2">
          {outputs.map((output, index) => (
            <div key={`${output.name}-${index}`} className="relative flex items-center justify-end gap-2">
              <Badge
                variant="outline"
                className="h-4 shrink-0 px-1 py-0 text-[10px]"
                style={{
                  backgroundColor: `${getTypeColor(output.type)}18`,
                  borderColor: `${getTypeColor(output.type)}60`,
                  color: getTypeColor(output.type),
                }}
              >
                {formatType(output.type)}
              </Badge>
              <span className="mr-1 min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
                {output.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.name}
                style={getHandleStyle(output.type)}
                className="!right-[-7px] !h-3 !w-3"
              />
            </div>
          ))}
        </div>
      )}

      {inputs.length === 0 && outputs.length === 0 && (
        <div className="px-3 py-3 text-[11px] text-muted-foreground">No typed ports</div>
      )}
    </div>
  );
});

StepNode.displayName = "StepNode";
