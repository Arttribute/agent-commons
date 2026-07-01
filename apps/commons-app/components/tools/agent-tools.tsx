"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, WrenchIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToolCard } from "./tool-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ToolCatalogItem } from "@/lib/tools/catalog";

function catalogItemToCardTool(item: ToolCatalogItem) {
  return {
    id: item.tool?.toolId ?? item.id,
    name: item.displayName,
    description: item.description,
    category: item.categoryLabel,
    tags: item.tags,
    creator: item.sourceLabel,
  };
}

export default function AgentTools({
  agentTools,
  setAgentTools,
  agentId,
}: {
  agentTools: any[];
  setAgentTools: (tools: any[]) => void;
  agentId: string;
}) {
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchCatalog = async () => {
      setLoadingCatalog(true);
      try {
        const res = await fetch("/api/tools/catalog", { cache: "no-store" });
        const data = await res.json();
        setCatalog(data.items ?? []);
      } catch {
        // silently fail — catalog is best-effort
      } finally {
        setLoadingCatalog(false);
      }
    };
    fetchCatalog();
  }, []);

  const myTools = catalog.filter((item) => item.category === "custom");
  const commonTools = catalog.filter((item) => item.category === "system");
  const externalTools = catalog.filter(
    (item) =>
      item.category === "google_workspace" ||
      item.category === "oauth" ||
      item.category === "mcp_api",
  );

  const isItemLoaded = (item: ToolCatalogItem): boolean => {
    const toolId = item.tool?.toolId;
    if (!toolId) return false;
    return agentTools.some((t) => t.toolId === toolId);
  };

  const filterAndSort = (items: ToolCatalogItem[]) => {
    let filtered = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = items.filter(
        (item) =>
          item.displayName.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          item.categoryLabel.toLowerCase().includes(q),
      );
    }
    return [...filtered].sort((a, b) => {
      return (isItemLoaded(b) ? 1 : 0) - (isItemLoaded(a) ? 1 : 0);
    });
  };

  const addTool = async (toolId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId }),
      });
      const data = await res.json();
      if (data?.data) setAgentTools([...agentTools, data.data]);
    } catch { /* ignore */ }
  };

  const removeTool = async (assignmentId: string) => {
    try {
      await fetch(`/api/agents/tools/${assignmentId}`, { method: "DELETE" });
      setAgentTools(agentTools.filter((t) => t.id !== assignmentId));
    } catch { /* ignore */ }
  };

  const toggleTool = async (item: ToolCatalogItem) => {
    const toolId = item.tool?.toolId;
    if (!toolId) return;
    const assignment = agentTools.find((t) => t.toolId === toolId);
    if (assignment) {
      await removeTool(assignment.id);
    } else {
      await addTool(toolId);
    }
  };

  const getToolDisplayName = (assignment: any): string => {
    if (assignment.name) return assignment.name;
    const match = catalog.find((c) => c.tool?.toolId === assignment.toolId);
    return match?.displayName ?? assignment.toolId ?? "Tool";
  };

  const renderTools = (items: ToolCatalogItem[], emptyMessage: string) => {
    const sorted = filterAndSort(items);
    if (sorted.length === 0) {
      return (
        <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-2">
        {sorted.map((item) => (
          <div className="col-span-1" key={item.id}>
            <ToolCard
              tool={catalogItemToCardTool(item)}
              isLoaded={isItemLoaded(item)}
              onToggle={() => toggleTool(item)}
              toolType={
                item.category === "custom"
                  ? "my"
                  : item.category === "system"
                    ? "common"
                    : "external"
              }
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="cursor-pointer border border-border rounded-lg p-2 h-24 hover:border-border transition-colors ">
          <div className="text-sm flex items-center gap-1 mb-1 ml-1">
            <div className="flex items-center gap-1">
              <WrenchIcon className="h-4 w-4 " />
              <h3 className="text-sm font-semibold">Agent Tools</h3>
            </div>
            <Badge variant="secondary">{agentTools.length}</Badge>
          </div>
          <div className="">
            {agentTools.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {agentTools
                  .slice(0, Math.min(5, agentTools.length))
                  .map((tool) => (
                    <div className="col-span-1" key={tool.id}>
                      <div className="border rounded-full px-2 py-0.5 w-full">
                        <p className="text-xs font-normal truncate max-w-[100px]">
                          {getToolDisplayName(tool)}
                        </p>
                      </div>
                    </div>
                  ))}
                {agentTools.length > 5 && (
                  <Badge variant="outline" className="text-xs max-w-[50px]">
                    +{agentTools.length - 5}
                  </Badge>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Agent Tools</DialogTitle>
          <DialogDescription>
            Manage the tools your agent can use to perform tasks
          </DialogDescription>
        </DialogHeader>

        {/* Loaded Tools Section */}
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">
            Loaded Tools ({agentTools.length})
          </h3>
          {agentTools.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agentTools.map((tool) => (
                <Badge
                  key={tool.id}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {getToolDisplayName(tool)}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={() => removeTool(tool.id)}
                  />
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tools loaded. Add tools below.
            </p>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loadingCatalog ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="my-tools" className="w-full">
            <TabsList className="grid max-w-xl grid-cols-3 mb-4">
              <TabsTrigger value="my-tools">My Tools</TabsTrigger>
              <TabsTrigger value="common-tools">Common Tools</TabsTrigger>
              <TabsTrigger value="external-tools">External Tools</TabsTrigger>
            </TabsList>

            <TabsContent value="my-tools" className="space-y-4 overflow-y-auto pr-2">
              <ScrollArea className="h-80 p-2">
                {renderTools(myTools, "No custom tools found. Create one in the Tools page.")}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="common-tools" className="space-y-4 overflow-y-auto pr-2">
              <ScrollArea className="h-80 p-2">
                {renderTools(commonTools, "No platform tools found.")}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="external-tools" className="space-y-4 overflow-y-auto pr-2">
              <ScrollArea className="h-80 p-2">
                {renderTools(externalTools, "No external integrations found.")}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
