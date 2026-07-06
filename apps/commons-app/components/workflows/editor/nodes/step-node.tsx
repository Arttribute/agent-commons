"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { getHandleStyle } from "@/lib/workflows/type-colors";
import { getTypeColor, WorkflowDataType } from "@/lib/workflows/type-mapping";
import type { WorkflowNodeType } from "@/types/workflow";
import { getNodeTheme } from "./node-theme";
import { getBrandIcon } from "@/lib/brand-icons";

interface StepNodeData {
  label: string;
  description?: string;
  nodeType?: WorkflowNodeType;
  toolName?: string;
  inputs?: Array<{ name: string; type: WorkflowDataType; required?: boolean }>;
  outputs?: Array<{ name: string; type: WorkflowDataType }>;
}

/** Distribute n handles evenly along the icon tile's edge */
function handleTop(index: number, count: number) {
  return `${((index + 1) / (count + 1)) * 100}%`;
}

export const StepNode = memo(({ id, data, selected, type }: NodeProps<StepNodeData>) => {
  const setDetailsNodeId = useWorkflowStore((state) => state.setDetailsNodeId);
  const nodeType = data.nodeType || (type as WorkflowNodeType) || "tool";
  const theme = getNodeTheme(nodeType);
  const Icon = theme.icon;
  const brand =
    nodeType === "tool" ? getBrandIcon(data.toolName, data.label) : null;
  // Same fallbacks the old dedicated input/output nodes provided, so
  // saved workflows keep their handle ids.
  const inputs =
    data.inputs ||
    (nodeType === "output"
      ? [{ name: "input", type: "any" as WorkflowDataType }]
      : []);
  const outputs =
    data.outputs ||
    (nodeType === "input"
      ? [{ name: "output", type: "any" as WorkflowDataType }]
      : []);
  const hasPorts = inputs.length > 0 || outputs.length > 0;

  return (
    <div className="group flex w-[148px] flex-col items-center">
      {/* Icon tile — the node itself */}
      <div className="relative">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-[1.35rem] shadow-sm transition-all duration-150",
            brand ? "bg-white dark:bg-zinc-900" : theme.tile,
            selected
              ? "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background shadow-md"
              : cn(
                  "group-hover:shadow-md group-hover:-translate-y-0.5",
                  brand
                    ? "ring-1 ring-black/10 dark:ring-white/15"
                    : "ring-1 ring-black/5 dark:ring-white/10"
                )
          )}
        >
          {brand ? (
            <brand.icon
              size={26}
              color={brand.monochrome ? "currentColor" : brand.hex}
              className={brand.monochrome ? "text-foreground" : undefined}
            />
          ) : (
            <Icon className="h-7 w-7" strokeWidth={1.9} />
          )}
        </div>

        {inputs.map((input, index) => (
          <Handle
            key={`in-${input.name}-${index}`}
            type="target"
            position={Position.Left}
            id={input.name}
            title={`${input.name}${input.required ? " (required)" : ""}: ${input.type}`}
            style={{
              ...getHandleStyle(input.type),
              top: handleTop(index, inputs.length),
              left: -6,
            }}
          />
        ))}

        {outputs.map((output, index) => (
          <Handle
            key={`out-${output.name}-${index}`}
            type="source"
            position={Position.Right}
            id={output.name}
            title={`${output.name}: ${output.type}`}
            style={{
              ...getHandleStyle(output.type),
              top: handleTop(index, outputs.length),
              right: -6,
            }}
          />
        ))}
      </div>

      {/* Name + kind */}
      <p className="mt-2 w-full truncate text-center text-xs font-semibold text-foreground">
        {data.label}
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {theme.label}
      </p>

      {/* Summary card — appears on hover or selection. The card itself never
          blocks the canvas; only the Details button takes pointer events. */}
      <div
        className={cn(
          "pointer-events-none mt-1.5 flex max-w-[200px] flex-col gap-0.5 rounded-lg border border-border/70 bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur-sm transition-opacity duration-150",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        {inputs.map((input, index) => (
          <div key={`legend-in-${index}`} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: getTypeColor(input.type) }}
            />
            <span className="truncate text-[10px] text-muted-foreground">
              {input.name}
              {input.required && <span className="text-destructive">*</span>}
              <span className="text-muted-foreground/50"> in</span>
            </span>
          </div>
        ))}
        {outputs.map((output, index) => (
          <div key={`legend-out-${index}`} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: getTypeColor(output.type) }}
            />
            <span className="truncate text-[10px] text-muted-foreground">
              {output.name}
              <span className="text-muted-foreground/50"> out</span>
            </span>
          </div>
        ))}

        {/* Explicit entry point for the node inspector — clicking the node
            itself only selects/drags, so this is the one way in. */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setDetailsNodeId(id);
          }}
          className={cn(
            "nodrag nopan pointer-events-auto flex w-full items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            hasPorts && "mt-1 border-t border-border/60 pt-1.5"
          )}
        >
          <PanelRightOpen className="h-3 w-3" />
          Details
        </button>
      </div>
    </div>
  );
});

StepNode.displayName = "StepNode";
