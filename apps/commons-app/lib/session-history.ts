/**
 * Reshape a persisted session history into the same message stream the live
 * chat produces, so a reloaded session looks identical to a freshly streamed
 * one:
 *
 * - Raw `tool`-role entries are hidden when the run's AI entry carries
 *   `metadata.toolCalls` (the activity timeline and mini computer render from
 *   those instead, exactly like during streaming).
 * - For legacy sessions whose AI entries have no persisted toolCalls, the
 *   tool entries are converted into synthesized toolCalls on the AI entry so
 *   at least the timeline pill renders instead of raw JSON cards.
 * - Intermediate AI entries with no content (tool-call-only turns) are
 *   dropped — the live stream never shows them.
 */

interface HistoryEntry {
  role: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export function normalizeSessionHistory(history: unknown): HistoryEntry[] {
  if (!Array.isArray(history)) return [];
  const result: HistoryEntry[] = [];
  let pendingTools: HistoryEntry[] = [];
  const withTimestamp = (entry: HistoryEntry): HistoryEntry =>
    entry.timestamp ? entry : { ...entry, timestamp: new Date().toISOString() };

  const attachPendingTools = (aiEntry: HistoryEntry) => {
    if (!pendingTools.length) return;
    const hasPersistedCalls = Boolean(aiEntry.metadata?.toolCalls?.length);
    if (!hasPersistedCalls) {
      aiEntry.metadata = {
        ...(aiEntry.metadata ?? {}),
        toolCalls: pendingTools.map((tool) => ({
          name: tool.metadata?.name ?? tool.name ?? "tool",
          args: tool.metadata?.args,
          result: tool.content,
          timestamp: tool.timestamp,
        })),
      };
    }
    pendingTools = [];
  };

  for (const raw of history) {
    const entry = raw as HistoryEntry;
    if (!entry || typeof entry !== "object") continue;
    const role = entry.role;

    if (role === "tool") {
      pendingTools.push(entry);
      continue;
    }

    if (role === "ai" || role === "assistant") {
      const hasContent =
        typeof entry.content === "string"
          ? entry.content.trim().length > 0
          : Boolean(entry.content);
      const hasRunMetadata = Boolean(
        entry.metadata?.toolCalls?.length || entry.metadata?.agentCalls?.length,
      );
      if (!hasContent && !hasRunMetadata && !pendingTools.length) continue;
      const copy: HistoryEntry = {
        ...entry,
        metadata: { ...(entry.metadata ?? {}) },
      };
      attachPendingTools(copy);
      if (!hasContent && !Boolean(copy.metadata?.toolCalls?.length) && !hasRunMetadata) {
        continue;
      }
      result.push(withTimestamp(copy));
      continue;
    }

    result.push(withTimestamp(entry));
  }

  // Tool entries with no AI message after them (e.g. interrupted run) —
  // keep them raw rather than dropping information.
  result.push(...pendingTools.map(withTimestamp));
  return result;
}
