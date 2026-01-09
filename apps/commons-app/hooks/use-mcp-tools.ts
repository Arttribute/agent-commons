import { useState, useEffect, useCallback } from "react";
import { McpTool } from "@/types/mcp";

interface UseMcpToolsForServerOptions {
  serverId: string;
  autoLoad?: boolean;
}

export function useMcpToolsForServer({
  serverId,
  autoLoad = true,
}: UseMcpToolsForServerOptions) {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    if (!serverId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/mcp/servers/${serverId}/tools`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load MCP tools");
      }

      setTools(data.tools || []);
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to load MCP tools:", err);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (autoLoad && serverId) {
      loadTools();
    }
  }, [autoLoad, loadTools, serverId]);

  return {
    tools,
    loading,
    error,
    loadTools,
  };
}

interface UseMcpToolsByOwnerOptions {
  ownerId: string;
  ownerType: "user" | "agent";
  autoLoad?: boolean;
}

export function useMcpToolsByOwner({
  ownerId,
  ownerType,
  autoLoad = true,
}: UseMcpToolsByOwnerOptions) {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTools = useCallback(async () => {
    if (!ownerId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        ownerId,
        ownerType,
      });

      const res = await fetch(`/api/v1/mcp/tools?${params}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load MCP tools");
      }

      setTools(data.tools || []);
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to load MCP tools:", err);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    if (autoLoad && ownerId) {
      loadTools();
    }
  }, [autoLoad, loadTools, ownerId]);

  return {
    tools,
    loading,
    error,
    loadTools,
  };
}
