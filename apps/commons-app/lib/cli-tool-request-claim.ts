const claimedRequests = new Set<string>();

/** Prevent replayed SSE events from repeating a local CLI side effect. */
export function claimCliToolRequest(requestId: string): boolean {
  if (claimedRequests.has(requestId)) return false;
  try {
    const key = `commons:cli-tool-request:${requestId}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // In-memory deduplication still protects the current page if storage is disabled.
  }
  claimedRequests.add(requestId);
  return true;
}
