import { proxyBackend } from "@/lib/backend-proxy";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ skillId: string; agentId: string }> },
) {
  const { skillId, agentId } = await params;
  return proxyBackend(
    `/v1/skills/${encodeURIComponent(skillId)}/agents/${encodeURIComponent(agentId)}`,
    { method: "PUT", body: await request.json() },
  );
}
