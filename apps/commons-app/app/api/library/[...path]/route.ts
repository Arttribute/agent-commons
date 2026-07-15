import { NextRequest } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const { path } = await context.params;
  const query = request.nextUrl.searchParams.toString();
  let body: unknown;
  if (!["GET", "DELETE"].includes(request.method)) {
    body = await request.json().catch(() => ({}));
  }
  return proxyBackend(
    `/v1/library/${path.map(encodeURIComponent).join("/")}${query ? `?${query}` : ""}`,
    { method: request.method as "GET" | "POST" | "PATCH" | "DELETE", body },
  );
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
