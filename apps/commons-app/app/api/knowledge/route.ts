import { NextRequest } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

async function forward(request: NextRequest) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const query = request.nextUrl.searchParams.toString();
  const body = request.method === "POST" ? await request.json() : undefined;
  return proxyBackend(`/v1/knowledge${query ? `?${query}` : ""}`, {
    method: request.method as "GET" | "POST",
    body,
  });
}

export const GET = forward;
export const POST = forward;
