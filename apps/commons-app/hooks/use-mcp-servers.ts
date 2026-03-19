import { useState, useEffect, useCallback } from "react";
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
      const res = await fetch(
        `/api/mcp/servers?ownerId=${encodeURIComponent(ownerId)}&ownerType=${encodeURIComponent(ownerType)}`
      );
      const data = await res.json();
      setServers(data.servers ?? []);
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
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, ownerId, ownerType }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed to create");
      const data = await res.json();
      await loadServers();
      return data as McpServer;
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
      const res = await fetch(`/api/mcp/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Failed to update");
      const data = await res.json();
      await loadServers();
      return data as McpServer;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const deleteServer = async (serverId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/mcp/servers/${serverId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
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
      const res = await fetch(`/api/mcp/servers/${serverId}/connect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to connect");
      const data = await res.json();
      await loadServers();
      return data as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const disconnectServer = async (serverId: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/mcp/servers/${serverId}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
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
      const res = await fetch(`/api/mcp/servers/${serverId}/status`);
      if (!res.ok) throw new Error("Failed to get status");
      return (await res.json()) as McpConnectionStatus;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const syncTools = async (serverId: string): Promise<McpSyncResult | null> => {
    setError(null);
    try {
      const res = await fetch(`/api/mcp/servers/${serverId}/sync`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync");
      const data = await res.json();
      await loadServers();
      return data as McpSyncResult;
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
