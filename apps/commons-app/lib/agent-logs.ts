// Agent-log fetching via the authenticated API proxy.
//
// Replaces the former direct browser -> Supabase query (which bypassed the
// API's authorization and depended on the public anon key). Reads now go
// through /api/logs/agents/:agentId, which is owner-scoped server-side.

export interface AgentLogRow {
  log_id: string;
  agent_id: string;
  session_id?: string;
  action?: string;
  status?: string;
  message?: string;
  response_time?: number;
  created_at: string;
  timestamp: string;
  tools?: Array<{
    name: string;
    status: string;
    summary?: string;
    duration?: number;
  }>;
}

interface ApiLog {
  id: string;
  action: string;
  status: string;
  message: string;
  timestamp: string;
  responseTime: number;
  agent: string;
  sessionId: string;
  tools?: AgentLogRow["tools"];
}

/** Fetch an agent's recent logs (owner-scoped) in the snake_case shape the
 *  logs/stats components consume. Returns [] on error. */
export async function fetchAgentLogs(
  agentId: string,
  opts: { limit?: number } = {},
): Promise<AgentLogRow[]> {
  if (!agentId) return [];
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  const res = await fetch(
    `/api/logs/agents/${encodeURIComponent(agentId)}${params.toString() ? `?${params}` : ""}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    console.error("Failed to fetch agent logs:", res.status);
    return [];
  }
  const json = await res.json().catch(() => ({}));
  const rows: ApiLog[] = json?.data ?? [];
  return rows.map((r) => ({
    log_id: r.id,
    agent_id: r.agent,
    session_id: r.sessionId || undefined,
    action: r.action,
    status: r.status,
    message: r.message,
    response_time: r.responseTime,
    created_at: r.timestamp,
    timestamp: r.timestamp,
    tools: r.tools ?? [],
  }));
}
