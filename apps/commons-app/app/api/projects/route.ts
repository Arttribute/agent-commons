import { NextRequest } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

async function forward(request: NextRequest) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : undefined;
  return proxyBackend("/v1/projects", { method: request.method as "GET" | "POST", body });
}

export const GET = forward;
export const POST = forward;
