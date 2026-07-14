import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{ agentId: string; channel: string; action: string }>;
  },
) {
  const { agentId, channel, action } = await context.params;
  return proxyBackend(
    `/v1/agents/${encodeURIComponent(agentId)}/runtime/channels/${encodeURIComponent(channel)}/${encodeURIComponent(action)}`,
    { method: "POST" },
  );
}
