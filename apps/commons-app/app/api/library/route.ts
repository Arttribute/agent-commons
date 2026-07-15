import { NextRequest } from "next/server";
import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(request: NextRequest) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const query = request.nextUrl.searchParams.toString();
  return proxyBackend(`/v1/library${query ? `?${query}` : ""}`);
}
