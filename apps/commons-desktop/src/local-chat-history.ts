import type { LocalMessage } from "@agent-commons/desktop-contract";
import type { OllamaMessage } from "./ollama-stream";

export const LOCAL_CONTEXT_SIZE = 16_384;

export function libraryTextResult(itemId: string, name: string, mimeType: string, text: string, offset: number, totalChars: number) {
  const encode = (length: number) => JSON.stringify({ itemId, name, mimeType, pythonInput: `INPUT_FILES[${JSON.stringify(itemId)}]`, offset, content: text.slice(0, length), nextOffset: offset + length < totalChars ? offset + length : null, totalChars });
  let low = 0, high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(encode(middle)) <= 4800) low = middle;
    else high = middle - 1;
  }
  return encode(low);
}

export function toolResult(name: string, content: string): OllamaMessage {
  return { role: "tool", tool_name: name, content: boundedContent(content, 5_000) };
}

function boundedContent(content: string, limit: number) {
  if (content.length <= limit) return content;
  try {
    const data = JSON.parse(content);
    const texts: { parent: Record<string, unknown>; key: string }[] = [];
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string' && /^(?:content|stdout|stderr|text|instructions|description|preview|summary|body|transcript)$/i.test(key)) texts.push({ parent: value as Record<string, unknown>, key });
        else if (typeof item === 'object') visit(item);
      }
    };
    visit(data);
    let encoded = JSON.stringify(data);
    while (encoded.length > limit) {
      const largest = texts.sort((a, b) => String(b.parent[b.key]).length - String(a.parent[a.key]).length)[0];
      if (!largest || String(largest.parent[largest.key]).length <= 100) break;
      const text = String(largest.parent[largest.key]);
      const length = Math.max(40, text.length - (encoded.length - limit) - 100);
      const shortened = `${text.slice(0, length / 2)}\n[Text shortened; use an explicit offset to read omitted source text.]\n${text.slice(-length / 2)}`;
      if (shortened.length >= text.length) break;
      largest.parent[largest.key] = shortened;
      encoded = JSON.stringify(data);
    }
    if (encoded.length <= limit) return encoded;
    let length = Math.max(20, Math.floor(limit / 4));
    let preview = JSON.stringify({ truncated: true, preview: `${content.slice(0, length)}\n[Structured result shortened]\n${content.slice(-length)}` });
    while (preview.length > limit && length > 10) {
      length = Math.floor(length / 2);
      preview = JSON.stringify({ truncated: true, preview: `${content.slice(0, length)}\n[Structured result shortened]\n${content.slice(-length)}` });
    }
    return preview;
  } catch { /* Ordinary terminal output is not JSON. */ }
  return `${content.slice(0, limit / 2)}\n[Output shortened; read a smaller range if needed.]\n${content.slice(-limit / 2)}`;
}

// Stored tool events predate native model history. Reconstruct complete call /
// result pairs, including old conversations, rather than dropping their evidence.
export function localChatHistory(history: LocalMessage[]): OllamaMessage[] {
  const groups = history.map((message): OllamaMessage[] => {
    if (message.role === "tool") {
      if (!message.toolName) return [];
      return [
        { role: "assistant", content: "", tool_calls: [{ function: { name: message.toolName, arguments: message.toolArgs ?? {} } }] },
        toolResult(message.toolName, message.content),
      ];
    }
    return [{ role: message.role, content: message.role === "user" ? `${message.content}${message.canvasContext ? `\n\n${message.canvasContext}` : ""}` : boundedContent(message.content, 8_000) }];
  });
  const retained: OllamaMessage[][] = [];
  let characters = 0;
  let start = groups.length;
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    const size = JSON.stringify(group).length;
    if (characters + size > 28_000 && retained.length) break;
    retained.unshift(group);
    characters += size;
    start = index;
  }
  // Keep recent evidence even when earlier logs were too large to retain. Its
  // initiating user turn anchors the reconstructed (complete) tool pairs.
  if (retained[0]?.[0]?.role !== "user") {
    const request = history.slice(0, start).reverse().find((message) => message.role === "user");
    if (request) retained.unshift([{ role: "user", content: boundedContent(request.content, 4_000) }]);
  }
  return retained.flat();
}

export function localPromptCharacterBudget(outputTokens: number, schemaCharacters = 0, imageCount = 0) {
  // Include schemas and image embeddings in addition to chat text, and reserve
  // the requested output. JSON/UUID/code text commonly uses fewer than three
  // characters per token; two bytes per token leaves conservative headroom.
  const available = LOCAL_CONTEXT_SIZE - outputTokens - Math.ceil(schemaCharacters / 2) - imageCount * 1024 - 512;
  if (available < 1024) throw new Error("The selected tools and images exceed the Local context budget. Use fewer inputs for this turn.");
  return Math.min(32_000, available * 2);
}

/** Prefer a full output budget, reducing it before rejecting a valid input. */
export function prepareLocalInference(messages: OllamaMessage[], schemaCharacters = 0, imageCount = 0) {
  let lastError: unknown;
  for (const outputTokens of [4096, 3072, 2048]) {
    try {
      const candidate = structuredClone(messages);
      compactToolLoop(candidate, localPromptCharacterBudget(outputTokens, schemaCharacters, imageCount), true);
      messages.splice(0, messages.length, ...candidate);
      return outputTokens;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

export function compactToolLoop(messages: OllamaMessage[], maxCharacters = 32_000, preserveLatestResult = false) {
  // Keep system + current request, retaining recent exchanges atomically. A
  // bounded prompt prevents Ollama silently truncating the task after big logs.
  let lastUser = messages.length - 1;
  while (lastUser > 0 && messages[lastUser].role !== "user") lastUser--;
  if (lastUser < 1) lastUser = 1;
  while (Buffer.byteLength(JSON.stringify(messages)) > maxCharacters && lastUser > 1) {
    let end = 2;
    while (end < lastUser && messages[end].role !== "user") end++;
    messages.splice(1, end - 1);
    lastUser -= end - 1;
  }
  while (Buffer.byteLength(JSON.stringify(messages)) > maxCharacters && messages.length > lastUser + 2) {
    let latestCall = -1;
    for (let index = messages.length - 1; index > lastUser; index--) {
      if (messages[index].role === "assistant" && messages[index].tool_calls?.length) { latestCall = index; break; }
    }
    let end = lastUser + 2;
    while (messages[end]?.role === "tool") end++;
    // Removing the newest group makes the next inference see the original
    // request again, causing repeated tools and losing their verified results.
    if (latestCall >= 0 && end > latestCall) break;
    messages.splice(lastUser + 1, end - lastUser - 1);
  }
  // Keep the newest call/result pair. Large reference excerpts can be read
  // again by their exact IDs and offsets; shorten their content explicitly.
  let latestCall = -1;
  for (let index = messages.length - 1; index > lastUser; index--) {
    if (messages[index].role === "assistant" && messages[index].tool_calls?.length) { latestCall = index; break; }
  }
  for (const message of messages.filter((entry, index) => entry.role === "tool" && (!preserveLatestResult || index < latestCall))) {
    const excess = Buffer.byteLength(JSON.stringify(messages)) - maxCharacters;
    if (excess <= 0) break;
    message.content = boundedContent(message.content, Math.max(256, message.content.length - excess - 256));
  }
  if (Buffer.byteLength(JSON.stringify(messages)) > maxCharacters) {
    throw new Error("This request exceeds the Local model context budget. Use a smaller message or fewer Knowledge excerpts, then continue this conversation. Tool results have been saved.");
  }
}
