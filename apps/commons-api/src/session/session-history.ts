type DurableHistoryEntry = {
  role?: unknown;
  content?: unknown;
};

export type RestoredSessionMessage = {
  type: 'user' | 'assistant';
  role: 'user' | 'assistant';
  content: unknown;
};

function modelRole(role: unknown): RestoredSessionMessage['role'] | null {
  if (role === 'human' || role === 'user') return 'user';
  if (role === 'ai' || role === 'assistant') return 'assistant';
  return null;
}

export function durableRole(role: unknown): 'human' | 'ai' | null {
  const normalized = modelRole(role);
  if (normalized === 'user') return 'human';
  if (normalized === 'assistant') return 'ai';
  return null;
}

function restoreContent(content: unknown) {
  if (typeof content !== 'string' || !content.startsWith('[')) {
    return content ?? '';
  }

  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/**
 * Convert durable session history back into model input.
 *
 * LangChain serializes user/assistant messages as `human`/`ai`, while older
 * records and external runtimes can contain `user`/`assistant`. Accept both
 * families and emit the OpenAI-style roles understood by MessagesAnnotation.
 * Tool and system entries stay excluded because each run injects a fresh
 * system prompt and tool results can contain expired signed URLs.
 */
export function restoreSessionMessages(
  history: unknown,
): RestoredSessionMessage[] {
  if (!Array.isArray(history)) return [];

  return history.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const entry = candidate as DurableHistoryEntry;
    const role = modelRole(entry.role);
    if (!role) return [];
    if (
      role === 'assistant' &&
      (entry.content === null ||
        entry.content === undefined ||
        (typeof entry.content === 'string' && !entry.content.trim()))
    ) {
      return [];
    }
    return [
      {
        type: role,
        role,
        content: restoreContent(entry.content),
      },
    ];
  });
}
