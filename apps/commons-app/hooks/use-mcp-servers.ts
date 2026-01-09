import { useState, useEffect, useCallback } from "react";
import {
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
      const params = new URLSearchParams({
        ownerId,
        ownerType,
      });

      const res = await fetch(`/api/v1/mcp/servers?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load MCP servers");
      }

      setServers(data.servers || []);
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to load MCP servers:", err);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  const createServer = async (
    request: CreateMcpServerRequest
  ): Promise<McpServer | null> => {
    setError(null);

    try {
      const params = new URLSearchParams({
        ownerId,
        ownerType,
      });

      const res = await fetch(`/api/v1/mcp/servers?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create MCP server");
      }

      // Reload servers to get updated list
      await loadServers();

      return data as McpServer;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to create MCP server:", err);
      return null;
    }
  };

  const updateServer = async (
    serverId: string,
    request: UpdateMcpServerRequest
  ): Promise<McpServer | null> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to update MCP server");
      }

      // Reload servers to get updated list
      await loadServers();

      return data as McpServer;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to update MCP server:", err);
      return null;
    }
  };

  const deleteServer = async (serverId: string): Promise<boolean> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete MCP server");
      }

      // Reload servers to get updated list
      await loadServers();

      return true;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to delete MCP server:", err);
      return false;
    }
  };

  const connectServer = async (
    serverId: string
  ): Promise<McpConnectionStatus | null> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}/connect`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to connect to MCP server");
      }

      // Reload servers to get updated status
      await loadServers();

      return data as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to connect to MCP server:", err);
      return null;
    }
  };

  const disconnectServer = async (serverId: string): Promise<boolean> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}/disconnect`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to disconnect from MCP server");
      }

      // Reload servers to get updated status
      await loadServers();

      return true;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to disconnect from MCP server:", err);
      return false;
    }
  };

  const getStatus = async (
    serverId: string
  ): Promise<McpConnectionStatus | null> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}/status`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to get server status");
      }

      return data as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to get server status:", err);
      return null;
    }
  };

  const syncTools = async (
    serverId: string,
    forceRefresh = false
  ): Promise<McpSyncResult | null> => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRefresh }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to sync tools");
      }

      // Reload servers to get updated tool count
      await loadServers();

      return data as McpSyncResult;
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to sync tools:", err);
      return null;
    }
  };

  useEffect(() => {
    if (autoLoad && ownerId) {
      loadServers();
    }
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
