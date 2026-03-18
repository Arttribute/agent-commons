import { useState, useEffect, useCallback } from "react";
import { commons } from "@/lib/commons";
import type {
  McpServer,
  CreateMcpServerRequest,
  UpdateMcpServerRequest,
  McpConnectionStatus,
  McpSyncResult,
} from "@/types/mcp";

interface UseMcpServersOptions {
  ownerId: string;
  ownerType: "user" | "agent";
  autoLoad?: boolean;
}

export function useMcpServers({
  ownerId,
  ownerType,
  autoLoad = true,
}: UseMcpServersOptions) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await commons.mcp.listServers(ownerId, ownerType);
      setServers((data as any).servers ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  const createServer = async (
    request: CreateMcpServerRequest
  ): Promise<McpServer | null> => {
    setError(null);
    try {
      const data = await commons.mcp.createServer({ ...request, ownerId, ownerType });
      await loadServers();
      return data as unknown as McpServer;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const updateServer = async (
    serverId: string,
    request: UpdateMcpServerRequest
  ): Promise<McpServer | null> => {
    setError(null);
    try {
      // SDK doesn't expose PUT /v1/mcp/servers/:id — call directly
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/mcp/servers/${serverId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }
      );
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed to update");
      await loadServers();
      return (await res.json()) as McpServer;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const deleteServer = async (serverId: string): Promise<boolean> => {
    setError(null);
    try {
      await commons.mcp.deleteServer(serverId);
      await loadServers();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const connectServer = async (
    serverId: string
  ): Promise<McpConnectionStatus | null> => {
    setError(null);
    try {
      const data = await commons.mcp.connect(serverId);
      await loadServers();
      return data as unknown as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const disconnectServer = async (serverId: string): Promise<boolean> => {
    setError(null);
    try {
      await commons.mcp.disconnect(serverId);
      await loadServers();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const getStatus = async (
    serverId: string
  ): Promise<McpConnectionStatus | null> => {
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/mcp/servers/${serverId}/status`
      );
      if (!res.ok) throw new Error("Failed to get status");
      return (await res.json()) as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const syncTools = async (
    serverId: string,
    forceRefresh = false
  ): Promise<McpSyncResult | null> => {
    setError(null);
    try {
      const data = await commons.mcp.sync(serverId);
      await loadServers();
      return data as unknown as McpSyncResult;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  useEffect(() => {
    if (autoLoad && ownerId) loadServers();
  }, [autoLoad, loadServers, ownerId]);

  return {
    servers,
    loading,
    error,
    loadServers,
    createServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    getStatus,
    syncTools,
  };
}
