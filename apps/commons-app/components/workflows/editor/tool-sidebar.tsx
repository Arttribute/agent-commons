"use client";

import { useEffect, useState } from "react";
import { Tool } from "@/types/tool";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Wrench, Download, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ToolSidebarProps {
  userId: string;
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
      // Fetch both user tools and static tools in parallel
      const [userRes, staticRes] = await Promise.all([
        fetch(`/api/tools?owner=${userId}&ownerType=user`),
        fetch(`/api/tools/static`),
      ]);

      const userData = await userRes.json();
      const staticData = await staticRes.json();

      if (userData.success || userData.data) {
        setUserTools(userData.data || []);
      }

      if (staticData.success || staticData.data) {
        setStaticTools(staticData.data || []);
      }
    } catch (error) {
      console.error("Failed to load tools:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUserTools = userTools.filter(
    (tool) =>
      tool.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredStaticTools = staticTools.filter(
    (tool) =>
      tool.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description?.toLowerCase().includes(search.toLowerCase())
  );

  const onDragStart = (
    event: React.DragEvent,
    nodeType: string,
    data: any
  ) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-64 border-r bg-white flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {/* Special nodes */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">
              Workflow Nodes
            </p>
            <div
              draggable
              onDragStart={(e) =>
                onDragStart(e, "input", {
                  type: "input",
                  label: "Input",
                })
              }
              className="p-3 border-2 border-green-500 rounded-lg cursor-move hover:bg-green-50 transition-colors mb-2"
            >
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">Input</p>
                  <p className="text-xs text-gray-500">Workflow input</p>
                </div>
              </div>
            </div>

            <div
              draggable
              onDragStart={(e) =>
                onDragStart(e, "output", {
                  type: "output",
                  label: "Output",
                })
              }
              className="p-3 border-2 border-purple-500 rounded-lg cursor-move hover:bg-purple-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-purple-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">Output</p>
                  <p className="text-xs text-gray-500">Workflow output</p>
                </div>
              </div>
            </div>
          </div>

          {/* Common/Static tools */}
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Loading tools...
            </p>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                  Common Tools ({filteredStaticTools.length})
                </p>

                {filteredStaticTools.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">
                    {search ? "No common tools found" : "No common tools"}
                  </p>
                ) : (
                  filteredStaticTools.map((tool) => (
                    <div
                      key={tool.toolId}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(e, "tool", {
                          type: "tool",
                          toolId: tool.toolId,
                          toolName: tool.name,
                          label: tool.displayName || tool.name,
                          schema: tool.schema,
                        })
                      }
                      className="p-3 border-2 border-purple-300 rounded-lg cursor-move hover:bg-purple-50 hover:border-purple-400 transition-colors mb-2"
                    >
                      <div className="flex items-start gap-2">
                        <Wrench className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {tool.displayName || tool.name}
                          </p>
                          {tool.description && (
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                              {tool.description}
                            </p>
                          )}
                          <Badge
                            variant="outline"
                            className="mt-1 text-xs bg-purple-50"
                          >
                            platform
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* User tools */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                  Your Tools ({filteredUserTools.length})
                </p>

                {filteredUserTools.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">
                    {search ? "No custom tools found" : "No custom tools"}
                  </p>
                ) : (
                  filteredUserTools.map((tool) => (
                    <div
                      key={tool.toolId}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(e, "tool", {
                          type: "tool",
                          toolId: tool.toolId,
                          toolName: tool.name,
                          label: tool.displayName || tool.name,
                          schema: tool.schema,
                        })
                      }
                      className="p-3 border-2 border-blue-300 rounded-lg cursor-move hover:bg-blue-50 hover:border-blue-400 transition-colors mb-2"
                    >
                      <div className="flex items-start gap-2">
                        <Wrench className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">
                            {tool.displayName || tool.name}
                          </p>
                          {tool.description && (
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                              {tool.description}
                            </p>
                          )}
                          {tool.visibility && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {tool.visibility}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
