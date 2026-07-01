"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  CheckSquare,
  GitBranch,
  Loader2,
  Repeat2,
  Replace,
  Search,
  Workflow,
  Wrench,
} from "lucide-react";
import type { ToolCatalogItem, WorkflowPaletteKind } from "@/lib/tools/catalog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ToolSidebarProps {
  userId: string;
}

interface PaletteNode {
  id: string;
  label: string;
  description?: string;
  badge?: string;
  icon: ReactNode;
  accentClass: string;
  dragData: {
    type: WorkflowPaletteKind;
    nodeType?: WorkflowPaletteKind;
    label: string;
    description?: string;
    toolId?: string;
    toolName?: string;
    agentId?: string;
    workflowId?: string;
    schema?: any;
    config?: Record<string, any>;
  };
}

function DragItem({ node }: { node: PaletteNode }) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(node.dragData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group flex cursor-grab select-none items-start gap-2.5 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-foreground/25 hover:bg-muted/35 active:cursor-grabbing"
    >
      <div className={cn("mt-0.5 shrink-0 rounded-md p-1.5", node.accentClass)}>
        {node.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{node.label}</p>
        {node.description && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
            {node.description}
          </p>
        )}
        {node.badge && (
          <Badge variant="secondary" className="mt-1 h-4 px-1.5 py-0 text-[10px]">
            {node.badge}
          </Badge>
        )}
      </div>
    </div>
  );
}

const flowNodes: PaletteNode[] = [
  {
    id: "flow:input",
    label: "Input",
    description: "Workflow entry point",
    icon: <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />,
    accentClass: "bg-emerald-50",
    dragData: { type: "input", label: "Input" },
  },
  {
    id: "flow:output",
    label: "Output",
    description: "Workflow exit point",
    icon: <ArrowUpFromLine className="h-3.5 w-3.5 text-violet-600" />,
    accentClass: "bg-violet-50",
    dragData: { type: "output", label: "Output" },
  },
  {
    id: "flow:condition",
    label: "Condition",
    description: "Branch on a boolean expression",
    icon: <GitBranch className="h-3.5 w-3.5 text-amber-700" />,
    accentClass: "bg-amber-50",
    dragData: {
      type: "condition",
      label: "Condition",
      config: { expression: "value === true" },
    },
  },
  {
    id: "flow:transform",
    label: "Transform",
    description: "Map fields between steps",
    icon: <Replace className="h-3.5 w-3.5 text-fuchsia-700" />,
    accentClass: "bg-fuchsia-50",
    dragData: {
      type: "transform",
      label: "Transform",
      config: { mapping: {} },
    },
  },
  {
    id: "flow:loop",
    label: "Loop",
    description: "Iterate over an array",
    icon: <Repeat2 className="h-3.5 w-3.5 text-rose-700" />,
    accentClass: "bg-rose-50",
    dragData: {
      type: "loop",
      label: "Loop",
      config: { itemsPath: "items" },
    },
  },
  {
    id: "flow:approval",
    label: "Human Approval",
    description: "Pause until a person approves",
    icon: <CheckSquare className="h-3.5 w-3.5 text-emerald-700" />,
    accentClass: "bg-emerald-50",
    dragData: {
      type: "human_approval",
      label: "Human Approval",
      config: { prompt: "Please review and approve this step." },
    },
  },
];

function catalogToPaletteNode(item: ToolCatalogItem): PaletteNode | null {
  if (!item.workflowNode) return null;

  if (item.workflowNode.nodeType === "agent_processor") {
    return {
      id: item.id,
      label: item.displayName,
      description: item.description,
      badge: "agent",
      icon: <Bot className="h-3.5 w-3.5 text-cyan-700" />,
      accentClass: "bg-cyan-50",
      dragData: {
        type: "agent_processor",
        label: item.displayName,
        description: item.description,
        agentId: item.workflowNode.agentId,
        config: item.workflowNode.config,
      },
    };
  }

  if (item.workflowNode.nodeType === "workflow") {
    return {
      id: item.id,
      label: item.displayName,
      description: item.description,
      badge: "workflow",
      icon: <Workflow className="h-3.5 w-3.5 text-indigo-700" />,
      accentClass: "bg-indigo-50",
      dragData: {
        type: "workflow",
        label: item.displayName,
        description: item.description,
        workflowId: item.workflowNode.workflowId,
        config: item.workflowNode.config,
      },
    };
  }

  return {
    id: item.id,
    label: item.displayName,
    description: item.description,
    badge: item.category === "custom" ? "custom" : item.category === "system" ? "system" : item.categoryLabel,
    icon: <Wrench className="h-3.5 w-3.5 text-blue-600" />,
    accentClass: item.category === "custom" ? "bg-orange-50 [&_svg]:text-orange-600" : "bg-blue-50",
    dragData: {
      type: "tool",
      label: item.displayName,
      description: item.description,
      toolId: item.workflowNode.toolId,
      toolName: item.workflowNode.toolName,
      schema: item.workflowNode.schema,
    },
  };
}

export function ToolSidebar({ userId }: ToolSidebarProps) {
  const [items, setItems] = useState<ToolCatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCatalog();
  }, [userId]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tools/catalog", { cache: "no-store" });
      const data = await response.json();
      setItems(data.items ?? []);
    } catch (error) {
      console.error("Failed to load workflow catalog:", error);
    } finally {
      setLoading(false);
    }
  };

  const query = search.trim().toLowerCase();
  const filteredFlowNodes = flowNodes.filter((node) =>
    !query ||
    node.label.toLowerCase().includes(query) ||
    node.description?.toLowerCase().includes(query),
  );

  const paletteGroups = useMemo(() => {
    const paletteItems = items
      .map(catalogToPaletteNode)
      .filter(Boolean) as PaletteNode[];

    const visible = paletteItems.filter((node) =>
      !query ||
      node.label.toLowerCase().includes(query) ||
      node.description?.toLowerCase().includes(query) ||
      node.badge?.toLowerCase().includes(query),
    );

    return {
      system: visible.filter((node) => node.badge === "system"),
      custom: visible.filter((node) => node.badge === "custom"),
      agents: visible.filter((node) => node.badge === "agent"),
      workflows: visible.filter((node) => node.badge === "workflow"),
    };
  }, [items, query]);

  const renderGroup = (title: string, nodes: PaletteNode[], empty: string) => (
    <div className="space-y-1.5">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {loading ? (
        <div className="space-y-1.5">
          {[...Array(2)].map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        nodes.map((node) => <DragItem key={node.id} node={node} />)
      )}
    </div>
  );

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-background">
      <div className="border-b border-border px-3 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workflow nodes
          </p>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search nodes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-3">
          <div className="space-y-1.5">
            <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Flow control
            </p>
            {filteredFlowNodes.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No flow nodes</p>
            ) : (
              filteredFlowNodes.map((node) => <DragItem key={node.id} node={node} />)
            )}
          </div>

          {renderGroup("Platform tools", paletteGroups.system, "No platform tools")}
          {renderGroup("Custom tools", paletteGroups.custom, "No custom tools")}
          {renderGroup("Agent processors", paletteGroups.agents, "No agents")}
          {renderGroup("Workflow invocations", paletteGroups.workflows, "No workflows")}
        </div>
      </ScrollArea>
    </div>
  );
}
