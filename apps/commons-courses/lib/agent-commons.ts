import { CommonsClient } from "@agent-commons/sdk";

export function getAgentCommonsClient() {
  const baseUrl =
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL ||
    "https://api.agentcommons.io";
  const apiKey = process.env.AGENT_COMMONS_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new CommonsClient({
    baseUrl,
    apiKey,
  });
}
