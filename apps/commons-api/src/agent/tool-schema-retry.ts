/** Stop a model from repeatedly paying for the same invalid tool call. */
export const MAX_CONSECUTIVE_TOOL_SCHEMA_FAILURES = 3;

export function nextToolSchemaFailureCount(previous: number, lastMessage: unknown): number {
  const message = lastMessage as { status?: string; content?: unknown } | undefined;
  return message?.status === 'error' &&
    typeof message.content === 'string' &&
    message.content.includes('Received tool input did not match expected schema')
    ? previous + 1
    : 0;
}
