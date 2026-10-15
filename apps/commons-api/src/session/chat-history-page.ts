type ChatMessage = { role: string; content: string; timestamp?: string };

/** Bound a tool page without silently discarding long messages. */
export function chatHistoryPage(history: ChatMessage[], offset = 0, contentOffset = 0) {
  const messages: Array<ChatMessage & { contentOffset?: number; continues?: boolean }> = [];
  let index = Math.min(history.length, Math.max(0, Math.trunc(Number.isFinite(offset) ? offset : 0)));
  let skip = Math.max(0, Math.trunc(Number.isFinite(contentOffset) ? contentOffset : 0));
  let remaining = 24_000;
  while (index < history.length && messages.length < 20 && remaining > 0) {
    const message = history[index];
    const text = String(message.content);
    const start = Math.min(skip, text.length);
    const content = text.slice(start, start + remaining);
    const continues = start + content.length < text.length;
    messages.push({ ...message, content, ...(start ? { contentOffset: start } : {}), ...(continues ? { continues: true } : {}) });
    remaining -= content.length;
    if (continues) return { messages, nextOffset: index, nextContentOffset: start + content.length, totalMessages: history.length };
    index++; skip = 0;
  }
  return { messages, nextOffset: index < history.length ? index : null, nextContentOffset: null, totalMessages: history.length };
}
