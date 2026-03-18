/**
 * Singleton CommonsClient for the Agent Commons API.
 *
 * Usage (client components):
 *   import { commons } from '@/lib/commons';
 *   const agents = await commons.agents.list(ownerAddress);
 *
 * Usage (streaming):
 *   for await (const event of commons.agents.stream({ agentId, messages })) {
 *     if (event.type === 'token') setOutput(p => p + event.content);
 *   }
 */

import { CommonsClient } from '@agent-commons/sdk';

const apiUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL ?? 'http://localhost:3001';

export const commons = new CommonsClient({ baseUrl: apiUrl });

/**
 * Create a CommonsClient with an initiator address (for authenticated runs).
 * Call this inside a component that has access to the user's wallet address.
 */
export function createCommonsClient(initiator: string): CommonsClient {
  return new CommonsClient({ baseUrl: apiUrl, initiator });
}
