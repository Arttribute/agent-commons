/**
 * The text of a chat message. Most models reply with a string, but OpenAI's
 * Responses API (GPT-5 and later) and Anthropic reply with content blocks
 * such as `[{ type: "text", text: "…" }]`. Joins text blocks the way the API
 * saves history, so a reply reads the same before and after a reload.
 */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          const type = (part as { type?: unknown }).type;
          if (type === undefined || type === "text" || type === "output_text") return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object" && typeof (content as { text?: unknown }).text === "string") {
    return (content as { text: string }).text;
  }
  return "";
}
