"use client";

import { McpServer } from "@/types/mcp";
import { useMcpToolsForServer } from "@/hooks/use-mcp-tools";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Wrench, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface McpToolsDialogProps {
  server: McpServer | null;
  open: boolean;
  onClose: () => void;
}

export function McpToolsDialog({ server, open, onClose }: McpToolsDialogProps) {
  const { tools, loading } = useMcpToolsForServer({
    serverId: server?.serverId || "",
    autoLoad: open && !!server,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="bg-teal-200 w-48 h-6 -mb-6 rounded-lg"></div>
          <DialogTitle>{server?.name} - Tools</DialogTitle>
          <DialogDescription>
            {tools.length} {tools.length === 1 ? "tool" : "tools"} discovered from
            this MCP server
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tools discovered yet</p>
              <p className="text-sm mt-1">
                Try syncing the server to discover tools
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tools.map((tool) => (
                <Card key={tool.mcpToolId} className="border-teal-100">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">
                            {tool.displayName || tool.toolName}
                          </h4>
                          {tool.isActive && (
                            <Badge variant="outline" className="gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {tool.toolName}
                        </p>
                      </div>

                      {tool.usageCount > 0 && (
                        <Badge variant="secondary">
                          {tool.usageCount} {tool.usageCount === 1 ? "use" : "uses"}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  {tool.description && (
                    <CardContent className="pt-0 pb-3">
                      <p className="text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                    </CardContent>
                  )}

                  {tool.inputSchema && (
                    <CardContent className="pt-0 pb-3">
                      <details className="cursor-pointer">
                        <summary className="text-xs font-medium text-muted-foreground mb-2">
                          Input Schema
                        </summary>
                        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </details>
                    </CardContent>
                  )}

                  {tool.lastUsedAt && (
                    <CardContent className="pt-0 pb-3">
                      <p className="text-xs text-muted-foreground">
                        Last used{" "}
                        {formatDistanceToNow(new Date(tool.lastUsedAt))} ago
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
