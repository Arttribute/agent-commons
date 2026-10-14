/**
 * One clean line from a chat message for list previews: Markdown, code and
 * links reduced to their words, whitespace collapsed. People's own messages
 * read "You: …", like a messenger.
 */
export function messagePreview(text: string | null | undefined, role?: string | null): string {
  if (!text) return "";
  const plain = text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  return role === "human" || role === "user" ? `You: ${plain}` : plain;
}
