"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Bot, Hammer, Search, Shapes, Workflow, Wrench, X } from "lucide-react";
import type { ToolCatalogItem, WorkflowPaletteKind } from "@/lib/tools/catalog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getNodeTheme } from "./nodes/node-theme";
import { getBrandIcon, type BrandIcon } from "./nodes/brand-icons";

interface ToolSidebarProps {
  userId: string;
}

interface PaletteNode {
  id: string;
  label: string;
  description?: string;
  badge?: string;
  /** Node-theme key that supplies the icon + accent chip */
  nodeType: WorkflowPaletteKind;
  /** Recognizable service mark, when the tool maps to one */
  brand?: BrandIcon;
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

type GroupKey = "flow" | "system" | "custom" | "agents" | "workflows";

const GROUPS: Array<{
  key: GroupKey;
  label: string;
  icon: LucideIcon;
  empty: string;
}> = [
  { key: "flow", label: "Flow control", icon: Shapes, empty: "No flow nodes" },
  { key: "system", label: "Platform tools", icon: Wrench, empty: "No platform tools" },
  { key: "custom", label: "Custom tools", icon: Hammer, empty: "No custom tools yet" },
  { key: "agents", label: "Agents", icon: Bot, empty: "No agents yet" },
  { key: "workflows", label: "Workflows", icon: Workflow, empty: "No workflows yet" },
];

function DragItem({ node }: { node: PaletteNode }) {
  const theme = getNodeTheme(node.nodeType);
  const Icon = theme.icon;

  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(node.dragData));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group flex cursor-grab select-none items-start gap-2.5 rounded-xl border border-transparent bg-transparent p-2 transition-colors hover:border-border hover:bg-muted/40 active:cursor-grabbing"
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 rounded-md p-1.5",
          node.brand ? "border border-border bg-background" : theme.chip
        )}
      >
        {node.brand ? (
          <node.brand.icon
            size={14}
            color={node.brand.monochrome ? "currentColor" : node.brand.hex}
            className={node.brand.monochrome ? "text-foreground" : undefined}
          />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
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
    nodeType: "input",
    dragData: { type: "input", label: "Input" },
  },
  {
    id: "flow:output",
    label: "Output",
    description: "Workflow exit point",
    nodeType: "output",
    dragData: { type: "output", label: "Output" },
  },
  {
    id: "flow:condition",
    label: "Condition",
    description: "Branch on a boolean expression",
    nodeType: "condition",
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
    nodeType: "transform",
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
    nodeType: "loop",
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
    nodeType: "human_approval",
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
      nodeType: "agent_processor",
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
      nodeType: "workflow",
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
    nodeType: "tool",
    brand: getBrandIcon(item.workflowNode.toolName, item.displayName) ?? undefined,
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
  const [activeGroup, setActiveGroup] = useState<GroupKey | null>(null);

  useEffect(() => {
    loadCatalog();
  }, [userId]);

  // Esc dismisses the open flyout
  useEffect(() => {
    if (!activeGroup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveGroup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGroup]);

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

  const paletteGroups = useMemo(() => {
    const paletteItems = items
      .map(catalogToPaletteNode)
      .filter(Boolean) as PaletteNode[];

    return {
      flow: flowNodes,
      system: paletteItems.filter((node) => node.badge === "system"),
      custom: paletteItems.filter((node) => node.badge === "custom"),
      agents: paletteItems.filter((node) => node.badge === "agent"),
      workflows: paletteItems.filter((node) => node.badge === "workflow"),
    } satisfies Record<GroupKey, PaletteNode[]>;
  }, [items]);

  const group = GROUPS.find((entry) => entry.key === activeGroup);
  const query = search.trim().toLowerCase();
  const visibleNodes = activeGroup
    ? paletteGroups[activeGroup].filter(
        (node) =>
          !query ||
          node.label.toLowerCase().includes(query) ||
          node.description?.toLowerCase().includes(query)
      )
    : [];

  const openGroup = (key: GroupKey) => {
    setSearch("");
    setActiveGroup((current) => (current === key ? null : key));
  };

  return (
    <TooltipProvider delayDuration={150}>
      {/* Icon rail — one button per node group */}
      <div
        className="floating-panel absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 p-1.5"
        role="toolbar"
        aria-label="Workflow nodes"
        aria-orientation="vertical"
      >
        {GROUPS.map((entry) => (
          <Tooltip key={entry.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openGroup(entry.key)}
                aria-pressed={activeGroup === entry.key}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  activeGroup === entry.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <entry.icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {entry.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Flyout with the selected group's nodes */}
      {group && (
        <div className="floating-panel absolute left-[4.25rem] top-1/2 z-20 flex max-h-[75%] w-64 -translate-y-1/2 flex-col overflow-hidden p-1.5">
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-lg"
              onClick={() => setActiveGroup(null)}
              aria-label="Close panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="relative px-0.5 pb-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${group.label.toLowerCase()}…`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 rounded-lg pl-8 text-xs"
              autoFocus
            />
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-0.5 p-0.5">
              {loading && group.key !== "flow" ? (
                [...Array(3)].map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-xl" />
                ))
              ) : visibleNodes.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {query ? "No matches" : group.empty}
                </p>
              ) : (
                visibleNodes.map((node) => <DragItem key={node.id} node={node} />)
              )}
            </div>
          </ScrollArea>

          <p className="px-1 pb-0.5 pt-1.5 text-[10px] text-muted-foreground/70">
            Drag a node onto the canvas
          </p>
        </div>
      )}
    </TooltipProvider>
  );
}
