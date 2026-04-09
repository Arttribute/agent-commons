"use client";

import { useState } from "react";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { CreateMcpServerDialog } from "./create-mcp-server-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Server, Plug, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  agentId: string;
}

export function AgentMcpSection({ agentId }: Props) {
  const { servers, loading, createServer, deleteServer, connectServer, disconnectServer, syncTools, loadServers } =
    useMcpServers({ ownerId: agentId, ownerType: "agent" });
  const { toast } = useToast();
  const [syncing, setSyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleCreate = async (req: any) => {
    const server = await createServer(req);
    if (server) {
      toast({ title: "MCP server added" });
      await connectServer(server.serverId);
      setSyncing(server.serverId);
      const result = await syncTools(server.serverId);
      setSyncing(null);
      if (result) toast({ description: `${result.toolsDiscovered} tools discovered` });
    }
  };

  const handleDelete = async (serverId: string, name: string) => {
    setDeleting(serverId);
    const ok = await deleteServer(serverId);
    setDeleting(null);
    if (ok) toast({ title: "Server removed", description: name });
  };

  const handleSync = async (serverId: string) => {
    setSyncing(serverId);
    const result = await syncTools(serverId);
    setSyncing(null);
    if (result) toast({ description: `${result.toolsDiscovered} tools synced` });
  };

  return (
    <div className="rounded-lg border border-border p-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          MCP Servers
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={loadServers} title="Refresh">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <CreateMcpServerDialog
            onSubmit={handleCreate}
            trigger={
              <Button variant="ghost" size="icon" className="h-5 w-5" title="Add MCP server">
                <Plus className="h-3 w-3" />
              </Button>
            }
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-3">
          <Server className="h-5 w-5 text-muted-foreground/30 mx-auto mb-1" />
          <p className="text-[11px] text-muted-foreground">No MCP servers</p>
          <CreateMcpServerDialog
            onSubmit={handleCreate}
            trigger={
              <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add server
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-1">
          {servers.map((server) => {
            const connected = server.status === "connected";
            return (
              <div
                key={server.serverId}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-muted/50"
              >
                <div className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", connected ? "bg-green-500" : "bg-muted-foreground/40")} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{server.name}</p>
                  {server.toolCount != null && (
                    <p className="text-[10px] text-muted-foreground">{server.toolCount} tools</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    title="Sync tools"
                    disabled={syncing === server.serverId}
                    onClick={() => handleSync(server.serverId)}
                  >
                    {syncing === server.serverId
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    title={connected ? "Disconnect" : "Connect"}
                    onClick={() => connected ? disconnectServer(server.serverId) : connectServer(server.serverId)}
                  >
                    {connected
                      ? <PlugZap className="h-3 w-3 text-green-500" />
                      : <Plug className="h-3 w-3 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive/60 hover:text-destructive"
                    title="Remove"
                    disabled={deleting === server.serverId}
                    onClick={() => handleDelete(server.serverId, server.name)}
                  >
                    {deleting === server.serverId
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
