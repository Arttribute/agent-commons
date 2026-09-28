import { NextRequest } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const { path } = await context.params;
  const body = ["GET", "DELETE"].includes(request.method)
    ? undefined
    : await request.json().catch(() => ({}));
  return proxyBackend(`/v1/projects/${path.map(encodeURIComponent).join("/")}`, {
    method: request.method as "GET" | "PATCH" | "DELETE",
    body,
  });
}

export const GET = forward;
export const PATCH = forward;
export const DELETE = forward;
