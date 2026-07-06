import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import { ensureEducatorCopilotProfile } from "@/lib/educator-copilot-agent";
import User from "@/models/User";

/**
 * Connectors are MCP servers owned by the educator's copilot agent. Adding a
 * connector (e.g. a Google Drive / Workspace MCP endpoint) gives the copilot
 * that server's tools on every subsequent run.
 */
async function copilotContext(sessionUser: {
  userId: string;
  email?: string | null;
  role: "learner" | "educator" | "admin";
}) {
  const userDoc = (await User.findById(sessionUser.userId)
    .select("name")
    .lean()) as { name?: string } | null;
  return ensureEducatorCopilotProfile({
    id: sessionUser.userId,
    email: sessionUser.email,
    name: userDoc?.name,
    role: sessionUser.role,
  });
}

export async function GET() {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ connectors: [], available: false });
  }

  try {
    const { servers } = await client.mcp.listServers(profile.agentId, "agent");
    const connectors = await Promise.all(
      (servers || []).map(async (server) => {
        let status: string | undefined;
        let toolsDiscovered: number | undefined;
        let lastError: string | null | undefined;
        try {
          const serverStatus = await client.mcp.getServerStatus(server.serverId);
          status = serverStatus.connected ? "connected" : "disconnected";
          toolsDiscovered = serverStatus.toolsDiscovered;
          lastError = serverStatus.lastError;
        } catch {
          status = "unknown";
        }
        return {
          id: server.serverId,
          name: server.name,
          description: server.description,
          connectionType: server.connectionType,
          status,
          toolsDiscovered,
          lastError,
        };
      })
    );
    return NextResponse.json({ available: true, connectors });
  } catch {
    return NextResponse.json({ connectors: [], available: false });
  }
}

export async function POST(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    url?: string;
    connectionType?: "sse" | "http" | "streamable-http";
    headers?: Record<string, string>;
  };
  const name = body.name?.trim();
  const url = body.url?.trim();
  if (!name || !url || !/^https?:\/\//.test(url)) {
    return NextResponse.json(
      { error: "name and a valid MCP server url are required." },
      { status: 400 }
    );
  }

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ error: "Copilot connectors are unavailable." }, { status: 503 });
  }

  const connectionType =
    body.connectionType === "sse" || body.connectionType === "http"
      ? body.connectionType
      : "streamable-http";
  const headers =
    body.headers && typeof body.headers === "object"
      ? Object.fromEntries(
          Object.entries(body.headers)
            .filter(([key, value]) => typeof key === "string" && typeof value === "string")
            .slice(0, 10)
        )
      : undefined;

  try {
    const server = await client.mcp.createServer({
      name: name.slice(0, 80),
      description: `Educator copilot connector (${connectionType})`,
      connectionType,
      connectionConfig: { url, ...(headers ? { headers } : {}) },
      ownerId: profile.agentId,
      ownerType: "agent",
    });

    let status = "created";
    let toolsDiscovered = 0;
    try {
      await client.mcp.connect(server.serverId);
      const synced = await client.mcp.sync(server.serverId);
      status = "connected";
      toolsDiscovered = synced.toolsDiscovered;
    } catch (error) {
      status = "error";
      return NextResponse.json({
        connector: {
          id: server.serverId,
          name: server.name,
          connectionType,
          status,
          lastError:
            error instanceof Error ? error.message : "Could not connect to the MCP server.",
        },
      });
    }

    return NextResponse.json({
      connector: {
        id: server.serverId,
        name: server.name,
        connectionType,
        status,
        toolsDiscovered,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create the connector.",
      },
      { status: 502 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const result = await requireEducator();
  if (result.error || !result.session) return result.error;

  const serverId = req.nextUrl.searchParams.get("id");
  if (!serverId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const { profile, client, agentReady } = await copilotContext(result.session);
  if (!client || !agentReady || !profile.agentId) {
    return NextResponse.json({ error: "Copilot connectors are unavailable." }, { status: 503 });
  }

  try {
    const { servers } = await client.mcp.listServers(profile.agentId, "agent");
    if (!(servers || []).some((server) => server.serverId === serverId)) {
      return NextResponse.json({ error: "Connector not found." }, { status: 404 });
    }
    await client.mcp.deleteServer(serverId);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  }
}
