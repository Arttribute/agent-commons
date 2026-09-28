import { requireCurrentCommonsUser } from "@/lib/current-user";
import { proxyBackend } from "@/lib/backend-proxy";

/** Recent agent runs for the signed-in person, for agent activity badges. */
export async function GET() {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  return proxyBackend("/v1/agents/runs/active");
}
