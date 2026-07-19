export type ConversationStarter = {
  /** Short call-to-action shown on the starter button (2–5 words). */
  label: string;
  /** Full prompt inserted into the composer when the button is clicked. */
  prompt: string;
};

/**
 * Normalizes an agent's stored conversation starters. Supports both the
 * legacy plain-string format and the rich {label, prompt} format, dropping
 * empty entries and capping at four starters.
 */
export function normalizeConversationStarters(
  value: unknown,
): ConversationStarter[] {
  if (!Array.isArray(value)) return [];
  const starters: ConversationStarter[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) starters.push({ label: text, prompt: text });
      continue;
    }
    if (item && typeof item === "object") {
      const label = String((item as any).label ?? "").trim();
      const prompt = String((item as any).prompt ?? "").trim();
      if (!label && !prompt) continue;
      starters.push({ label: label || prompt, prompt: prompt || label });
    }
  }
  return starters.slice(0, 4);
}
