import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ agentId: string; channel: string; action: string }>;
  },
) {
  const { agentId, channel, action } = await context.params;
  const body = await request.json().catch(() => ({}));
  return proxyBackend(
    `/v1/agents/${encodeURIComponent(agentId)}/runtime/channels/${encodeURIComponent(channel)}/${encodeURIComponent(action)}`,
    { method: "POST", body },
  );
}
