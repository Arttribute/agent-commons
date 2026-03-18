import { useState, useEffect, useCallback } from "react";
import { commons } from "@/lib/commons";
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
      const data = await commons.mcp.listTools(serverId);
      setTools((data as any).tools ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (autoLoad && serverId) loadTools();
  }, [autoLoad, loadTools, serverId]);

  return { tools, loading, error, loadTools };
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
      const data = await commons.mcp.listToolsByOwner(ownerId, ownerType);
      setTools((data as any).tools ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, ownerType]);

  useEffect(() => {
    if (autoLoad && ownerId) loadTools();
  }, [autoLoad, loadTools, ownerId]);

  return { tools, loading, error, loadTools };
}
