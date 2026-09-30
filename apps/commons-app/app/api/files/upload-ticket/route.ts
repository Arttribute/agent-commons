import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl) return Response.json({ error: "Server base URL not configured" }, { status: 500 });
  const { user } = await requireCurrentCommonsUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const upstream = await fetch(`${baseUrl}/v1/files/upload-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...await backendAuthHeaders(), "x-initiator": user.userId },
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType, size: input.size, workspaceId: user.workspaceId, agentId: input.agentId, sessionId: input.sessionId, storageProvider: input.storageProvider }),
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return Response.json(result, { status: upstream.status });
  const ticket = result?.data?.ticket;
  if (typeof ticket !== "string") return Response.json({ error: "Upload ticket unavailable" }, { status: 502 });
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/v1/files/upload-direct`);
  url.searchParams.set("ticket", ticket);
  return Response.json({ data: { url: url.toString() } });
}
