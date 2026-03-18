"use client";

import { useEffect, useState } from "react";
import { Tool } from "@/types/tool";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Wrench, ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { commons } from "@/lib/commons";

interface ToolSidebarProps {
  userId: string;
}

function DragItem({
  onDragStart,
  icon,
  label,
  description,
  badge,
  accentClass,
}: {
  onDragStart: (e: React.DragEvent) => void;
  icon: React.ReactNode;
  label: string;
  description?: string;
  badge?: string;
  accentClass?: string;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-background cursor-grab hover:border-border/80 hover:bg-muted/40 hover:shadow-sm transition-all duration-150 active:cursor-grabbing select-none"
    >
      <div className={`mt-0.5 rounded-md p-1.5 shrink-0 ${accentClass ?? "bg-muted"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{description}</p>
        )}
        {badge && (
          <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0 h-4">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ToolSidebar({ userId }: ToolSidebarProps) {
  const [userTools, setUserTools] = useState<Tool[]>([]);
  const [staticTools, setStaticTools] = useState<Tool[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTools();
  }, [userId]);

  const loadTools = async () => {
    try {
      const [userData, staticData] = await Promise.all([
        commons.tools.list({ owner: userId, ownerType: "user" }),
        commons.tools.listStatic(),
      ]);
      setUserTools((userData.data ?? []) as unknown as Tool[]);
      setStaticTools((staticData.data ?? []) as unknown as Tool[]);
    } catch (error) {
      console.error("Failed to load tools:", error);
    } finally {
      setLoading(false);
    }
  };

  const filter = (tools: Tool[]) =>
    tools.filter(
      (t) =>
        !search ||
        (t.displayName ?? t.name).toLowerCase().includes(search.toLowerCase()) ||
        t.description?.toLowerCase().includes(search.toLowerCase())
    );

  const onDragStart = (event: React.DragEvent, data: any) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-60 border-r border-border bg-background flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Nodes
        </p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Workflow special nodes */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
              Flow Control
            </p>
            <DragItem
              onDragStart={(e) => onDragStart(e, { type: "input", label: "Input" })}
              icon={<ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />}
              label="Input"
              description="Workflow entry point"
              accentClass="bg-emerald-50"
            />
            <DragItem
              onDragStart={(e) => onDragStart(e, { type: "output", label: "Output" })}
              icon={<ArrowUpFromLine className="h-3.5 w-3.5 text-violet-600" />}
              label="Output"
              description="Workflow exit point"
              accentClass="bg-violet-50"
            />
          </div>

          {/* Platform tools */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
              Platform Tools
            </p>
            {loading ? (
              <div className="space-y-1.5">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : filter(staticTools).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                {search ? "No results" : "No platform tools"}
              </p>
            ) : (
              filter(staticTools).map((tool) => (
                <DragItem
                  key={tool.toolId}
                  onDragStart={(e) =>
                    onDragStart(e, {
                      type: "tool",
                      toolId: tool.toolId,
                      toolName: tool.name,
                      label: tool.displayName || tool.name,
                      schema: tool.schema,
                    })
                  }
                  icon={<Wrench className="h-3.5 w-3.5 text-blue-600" />}
                  label={tool.displayName || tool.name}
                  description={tool.description}
                  badge="platform"
                  accentClass="bg-blue-50"
                />
              ))
            )}
          </div>

          {/* User tools */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
              Your Tools
            </p>
            {loading ? (
              <div className="space-y-1.5">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : filter(userTools).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                {search ? "No results" : "No custom tools yet"}
              </p>
            ) : (
              filter(userTools).map((tool) => (
                <DragItem
                  key={tool.toolId}
                  onDragStart={(e) =>
                    onDragStart(e, {
                      type: "tool",
                      toolId: tool.toolId,
                      toolName: tool.name,
                      label: tool.displayName || tool.name,
                      schema: tool.schema,
                    })
                  }
                  icon={<Wrench className="h-3.5 w-3.5 text-orange-500" />}
                  label={tool.displayName || tool.name}
                  description={tool.description}
                  badge={tool.visibility}
                  accentClass="bg-orange-50"
                />
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
