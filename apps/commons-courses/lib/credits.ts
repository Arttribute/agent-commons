import { platformServiceToken } from "@/lib/platform-service-token";

type ClaimRewardInput = {
  identityUserId: string;
  workspaceId?: string | null;
  campaignKey: "commonlab-course-completion" | "commonlab-skill-challenge";
  eventId: string;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Ask the central campaign engine to award a verified CommonLab event.
 * CommonLab supplies identity + event evidence; the API owns reward amount,
 * caps, budget, expiry, and idempotency.
 */
export async function claimCommonLabReward(input: ClaimRewardInput) {
  const baseUrl =
    process.env.COMMONS_API_URL ||
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;
  const token = await platformServiceToken("agent_commons", "credits:write");
  if (!baseUrl || !token) return { granted: false };

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/credits/campaigns/claim`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignKey: input.campaignKey,
        principalId: input.identityUserId,
        workspaceId: input.workspaceId,
        eventId: input.eventId,
        sourcePlatform: "commonlab",
        relatedCourseId: input.relatedCourseId,
        relatedChallengeId: input.relatedChallengeId,
        agentId: input.agentId,
        metadata: input.metadata,
      }),
    },
  );

  if (!response.ok) return { granted: false, status: response.status };
  const payload = await response.json();
  return { granted: true, ...payload.data };
}
