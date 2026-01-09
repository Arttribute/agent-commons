"use client";

import { useState } from "react";
import { McpServer } from "@/types/mcp";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { McpServerCard } from "./mcp-server-card";
import { CreateMcpServerDialog } from "./create-mcp-server-dialog";
import { McpToolsDialog } from "./mcp-tools-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Loader2, Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface McpServersViewProps {
  ownerId: string;
  ownerType: "user" | "agent";
}

export function McpServersView({ ownerId, ownerType }: McpServersViewProps) {
  const {
    servers,
    loading,
    createServer,
    deleteServer,
    connectServer,
    disconnectServer,
    syncTools,
    loadServers,
  } = useMcpServers({ ownerId, ownerType });

  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "connected" | "disconnected">(
    "all"
  );
  const [deleteServerState, setDeleteServerState] = useState<McpServer | null>(
    null
  );
  const [viewToolsServer, setViewToolsServer] = useState<McpServer | null>(null);

  const filteredServers = servers.filter((server) => {
    const matchesSearch =
      searchQuery === "" ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      viewFilter === "all" ||
      (viewFilter === "connected" && server.status === "connected") ||
      (viewFilter === "disconnected" && server.status !== "connected");

    return matchesSearch && matchesFilter;
  });

  const handleCreateServer = async (request: any) => {
    const server = await createServer(request);
    if (server) {
      toast({
        title: "MCP Server Created",
        description: `${server.name} has been configured successfully.`,
      });

      // Auto-connect and sync
      const status = await connectServer(server.serverId);
      if (status) {
        toast({
          title: "Connected",
          description: "Discovering tools from the MCP server...",
        });
        await syncTools(server.serverId);
      }
    }
  };

  const handleDeleteServer = async () => {
    if (!deleteServerState) return;

    const success = await deleteServer(deleteServerState.serverId);
    if (success) {
      toast({
        title: "Server Deleted",
        description: `${deleteServerState.name} has been removed.`,
      });
      setDeleteServerState(null);
    }
  };

  const handleConnect = async (serverId: string) => {
    const status = await connectServer(serverId);
    if (status) {
      toast({
        title: "Connected",
        description: "MCP server connected successfully.",
      });
      // Auto-sync tools
      await syncTools(serverId);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    const success = await disconnectServer(serverId);
    if (success) {
      toast({
        title: "Disconnected",
        description: "MCP server disconnected.",
      });
    }
  };

  const handleSync = async (serverId: string) => {
    const result = await syncTools(serverId);
    if (result) {
      toast({
        title: "Tools Synced",
        description: `Discovered ${result.toolsDiscovered} tools (${result.toolsAdded} new, ${result.toolsUpdated} updated, ${result.toolsRemoved} removed)`,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search MCP servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Tabs
            value={viewFilter}
            onValueChange={(v) => setViewFilter(v as typeof viewFilter)}
            className="border border-gray-400 rounded-md bg-gray-200"
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="connected">Connected</TabsTrigger>
              <TabsTrigger value="disconnected">Disconnected</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="outline" size="icon" onClick={loadServers}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <CreateMcpServerDialog onSubmit={handleCreateServer} />
        </div>

        <div className="text-sm text-muted-foreground">
          {filteredServers.length} {filteredServers.length === 1 ? "server" : "servers"}
        </div>
      </div>

      {/* Servers Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">
            {searchQuery || viewFilter !== "all"
              ? "No MCP servers found matching your filters"
              : "No MCP servers configured yet"}
          </p>
          {!searchQuery && viewFilter === "all" && (
            <CreateMcpServerDialog
              onSubmit={handleCreateServer}
              trigger={
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First MCP Server
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServers.map((server) => (
            <McpServerCard
              key={server.serverId}
              server={server}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSync={handleSync}
              onViewTools={setViewToolsServer}
              onDelete={setDeleteServerState}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteServerState}
        onOpenChange={() => setDeleteServerState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteServerState?.name}&quot;? This will also
              remove all discovered tools from this server. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteServer}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tools Dialog */}
      <McpToolsDialog
        server={viewToolsServer}
        open={!!viewToolsServer}
        onClose={() => setViewToolsServer(null)}
      />
    </div>
  );
}
