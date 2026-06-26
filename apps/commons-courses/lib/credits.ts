import { platformServiceToken } from "@/lib/platform-service-token";

type GrantCreditsInput = {
  identityUserId: string;
  workspaceId?: string | null;
  amount: number;
  eventType: string;
  idempotencyKey: string;
  description?: string;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

export async function grantCommonLabCredits(input: GrantCreditsInput) {
  if (!input.amount || input.amount <= 0) return { granted: false };
  const baseUrl =
    process.env.COMMONS_API_URL ||
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;
  const token = await platformServiceToken("agent_commons", "credits:write");
  if (!baseUrl || !token) return { granted: false };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/credits/grants`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      principalId: input.identityUserId,
      principalType: "user",
      workspaceId: input.workspaceId,
      amount: input.amount,
      eventType: input.eventType,
      sourcePlatform: "commonlab",
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      relatedCourseId: input.relatedCourseId,
      relatedChallengeId: input.relatedChallengeId,
      agentId: input.agentId,
      metadata: input.metadata,
    }),
  });

  if (!response.ok) {
    return { granted: false, status: response.status };
  }
  return { granted: true, data: await response.json() };
}
