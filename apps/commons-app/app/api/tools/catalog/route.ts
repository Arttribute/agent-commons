import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { buildToolCatalog } from "@/lib/tools/catalog";

const baseUrl =
  process.env.NEXT_PUBLIC_NEST_API_BASE_URL ||
  process.env.NEST_API_BASE_URL ||
  process.env.AGENT_COMMONS_API_URL ||
  process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;

function apiUrl(path: string) {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function fetchJson(path: string, headers: Record<string, string>) {
  const url = apiUrl(path);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers,
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch {
    return null;
  }
}

function asList(payload: any, keys: string[]) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export async function GET() {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;

  const headers = await backendAuthHeaders({ allowServiceKey: true });
  const ownerQuery = `ownerId=${encodeURIComponent(user.userId)}&ownerType=user`;
  const ownerToolQuery = `owner=${encodeURIComponent(user.userId)}&ownerType=user`;

  const [
    providers,
    connections,
    staticTools,
    userTools,
    platformTools,
    mcpServers,
    agents,
    workflows,
  ] = await Promise.all([
    fetchJson("/v1/oauth/providers", headers),
    fetchJson(`/v1/oauth/connections?${ownerQuery}`, headers),
    fetchJson("/v1/tools/static", headers),
    fetchJson(`/v1/tools?${ownerToolQuery}`, headers),
    fetchJson("/v1/tools?visibility=platform", headers),
    fetchJson(`/v1/mcp/servers?${ownerQuery}`, headers),
    fetchJson(`/v1/agents?owner=${encodeURIComponent(user.userId)}`, headers),
    fetchJson(`/v1/workflows?${ownerQuery}`, headers),
  ]);

  const items = buildToolCatalog({
    providers: asList(providers, ["providers", "data"]),
    connections: asList(connections, ["connections", "data"]),
    staticTools: asList(staticTools, ["data", "tools"]),
    userTools: asList(userTools, ["data", "tools"]),
    platformTools: asList(platformTools, ["data", "tools"]),
    mcpServers: asList(mcpServers, ["servers", "data"]),
    agents: asList(agents, ["data", "agents"]).map((agent: any) => ({
      ...agent,
      agentId: agent.agentId || agent.agent_id || agent.id,
    })),
    workflows: asList(workflows, ["data", "workflows"]),
  });

  return NextResponse.json({
    items,
    total: items.length,
    meta: {
      ownerId: user.userId,
      baseUrlConfigured: Boolean(baseUrl),
      generatedAt: new Date().toISOString(),
      sources: [
        "https://developers.google.com/workspace/guides/configure-mcp-servers",
        "https://github.com/modelcontextprotocol/servers",
        "https://modelcontextprotocol.io/examples",
        "https://github.com/github/github-mcp-server",
        "https://docs.slack.dev/ai/slack-mcp-server",
        "https://developers.notion.com/guides/mcp/overview",
        "https://playwright.dev/docs/getting-started-mcp",
      ],
    },
  });
}

