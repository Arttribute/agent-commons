"use client";

import { Workflow, ReactFlowNode } from "@/types/workflow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Edit, Copy, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { getBrandIcon } from "@/lib/brand-icons";
import { getNodeTheme } from "@/components/workflows/editor/nodes/node-theme";
import { cn } from "@/lib/utils";

/** The list API returns full rows, including the canvas definition */
type WorkflowListItem = Workflow & {
  definition?: { nodes?: ReactFlowNode[] };
};

interface WorkflowCardProps {
  workflow: WorkflowListItem;
  onDelete?: (workflowId: string) => void;
  onDuplicate?: (workflowId: string) => void;
}

/**
 * Make-style visual summary: the workflow's steps as a stack of overlapping
 * icon coins (brand marks for recognizable tools, themed tiles otherwise),
 * with a "+N" coin for the rest.
 */
function NodeCoinStack({ nodes }: { nodes: ReactFlowNode[] }) {
  const steps = nodes.filter((node) => node.type !== "input" && node.type !== "output");
  const shown = steps.slice(0, 4);
  const extra = steps.length - shown.length;

  if (steps.length === 0) {
    return (
      <div className="flex h-9 items-center text-[11px] text-muted-foreground/70">
        Empty canvas
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {shown.map((node, index) => {
        const brand =
          node.type === "tool" || node.data?.nodeType === "tool"
            ? getBrandIcon(node.data?.toolName, node.data?.label)
            : null;
        const theme = getNodeTheme(node.data?.nodeType ?? node.type);
        const Icon = theme.icon;
        return (
          <div
            key={node.id ?? index}
            title={node.data?.label}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-background",
              index > 0 && "-ml-2",
              brand ? "border border-border bg-white dark:bg-zinc-900" : theme.tile
            )}
          >
            {brand ? (
              <brand.icon
                size={16}
                color={brand.monochrome ? "currentColor" : brand.hex}
                className={brand.monochrome ? "text-foreground" : undefined}
              />
            ) : (
              <Icon className="h-4 w-4" strokeWidth={1.9} />
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <div className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-background">
          +{extra}
        </div>
      )}
    </div>
  );
}

export function WorkflowCard({
  workflow,
  onDelete,
  onDuplicate,
}: WorkflowCardProps) {
  const router = useRouter();
  const updatedAt = workflow.updatedAt ? new Date(workflow.updatedAt) : null;
  const updatedLabel =
    updatedAt && !Number.isNaN(updatedAt.getTime())
      ? formatDistanceToNow(updatedAt, { addSuffix: true })
      : "recently";
  const nodes = workflow.definition?.nodes ?? [];

  const handleEdit = () => {
    router.push(`/studio/workflows/${workflow.workflowId}`);
  };

  return (
    <div
      className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-background p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-md"
      onClick={handleEdit}
    >
      <div className="flex items-center justify-between gap-2">
        <NodeCoinStack nodes={nodes} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Workflow actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>
              <Edit className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate?.(workflow.workflowId);
              }}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(workflow.workflowId);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="mt-3 truncate text-sm font-normal text-foreground">
        {workflow.name}
      </h3>
      <p className="mt-1 truncate text-xs leading-4 text-muted-foreground">
        {workflow.description || "No description"}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              workflow.isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
            )}
          />
          {workflow.isActive ? "Active" : "Paused"}
        </span>
        <span className="truncate">Updated {updatedLabel}</span>
      </div>
    </div>
  );
}
