"use client";

import { McpServer } from "@/types/mcp";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { McpConnectionStatus } from "./mcp-connection-status";
import {
  MoreVertical,
  Wrench,
  RefreshCw,
  Edit,
  Trash2,
  Plug,
  PlugZap,
  Terminal,
  Wifi,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface McpServerCardProps {
  server: McpServer;
  onConnect?: (serverId: string) => void;
  onDisconnect?: (serverId: string) => void;
  onSync?: (serverId: string) => void;
  onViewTools?: (server: McpServer) => void;
  onEdit?: (server: McpServer) => void;
  onDelete?: (server: McpServer) => void;
}

export function McpServerCard({
  server,
  onConnect,
  onDisconnect,
  onSync,
  onViewTools,
  onEdit,
  onDelete,
}: McpServerCardProps) {
  const isConnected = server.status === "connected";

  return (
    <Card className="hover:border-teal-300 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-teal-50 to-green-50 rounded-lg border border-teal-200">
              {server.connectionType === "stdio" ? (
                <Terminal className="h-4 w-4 text-teal-600" />
              ) : (
                <Wifi className="h-4 w-4 text-teal-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-base">{server.name}</h3>
              <p className="text-xs text-muted-foreground">
                {server.connectionType.toUpperCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <McpConnectionStatus status={server.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isConnected ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => onViewTools?.(server)}
                      className="cursor-pointer"
                    >
                      <Wrench className="h-4 w-4 mr-2" />
                      View Tools ({server.toolsCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onSync?.(server.serverId)}
                      className="cursor-pointer"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Tools
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDisconnect?.(server.serverId)}
                      className="cursor-pointer"
                    >
                      <Plug className="h-4 w-4 mr-2" />
                      Disconnect
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onClick={() => onConnect?.(server.serverId)}
                    className="cursor-pointer"
                  >
                    <PlugZap className="h-4 w-4 mr-2" />
                    Connect
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onEdit?.(server)}
                  className="cursor-pointer"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete?.(server)}
                  className="cursor-pointer text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {server.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {server.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            <Wrench className="h-3 w-3 mr-1" />
            {server.toolsCount} {server.toolsCount === 1 ? "tool" : "tools"}
          </Badge>

          {server.isPublic && (
            <Badge variant="secondary" className="text-xs">
              Public
            </Badge>
          )}

          {server.tags && server.tags.length > 0 && (
            <>
              {server.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {server.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{server.tags.length - 2}
                </Badge>
              )}
            </>
          )}
        </div>

        {server.lastSyncedAt && (
          <div className="text-xs text-muted-foreground">
            Last synced {formatDistanceToNow(new Date(server.lastSyncedAt))} ago
          </div>
        )}

        {server.lastError && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {server.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
