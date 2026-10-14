import type { LocalMessage } from "@agent-commons/desktop-contract";
import type { OllamaMessage } from "./ollama-stream";

export const LOCAL_CONTEXT_SIZE = 16_384;

export function libraryTextResult(itemId: string, name: string, mimeType: string, text: string, offset: number, totalChars: number, sourceContext: Record<string, unknown> = {}) {
  const encode = (length: number) => {
    const endOfText = offset + length >= totalChars;
    return JSON.stringify({ ...sourceContext, itemId, name, mimeType, pythonInput: `INPUT_FILES[${JSON.stringify(itemId)}]`, offset, content: text.slice(0, length), nextOffset: endOfText ? null : offset + length, totalChars, endOfText,
      ...(endOfText ? { readStatus: length ? "final_chunk" : "end_of_text", hint: `${sourceContext.hint ? `${sourceContext.hint} ` : ""}End of this document. There is no next chunk. Use the source facts already read to complete the requested task; read another source only if needed. To revisit a specific passage, supply its explicit earlier offset.` } : {}),
    });
  };
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
    const start = content.startsWith('Error:') ? content.indexOf('\n{') + 1 : 0;
    const prefix = content.slice(0, start);
    const available = limit - prefix.length;
    const data = JSON.parse(content.slice(start));
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
    while (encoded.length > available) {
      const largest = texts.sort((a, b) => String(b.parent[b.key]).length - String(a.parent[a.key]).length)[0];
      if (!largest || String(largest.parent[largest.key]).length <= 100) break;
      const text = String(largest.parent[largest.key]);
      const length = Math.max(40, text.length - (encoded.length - available) - 100);
      const shortened = `${text.slice(0, length / 2)}\n[Text shortened; use an explicit offset to read omitted source text.]\n${text.slice(-length / 2)}`;
      if (shortened.length >= text.length) break;
      largest.parent[largest.key] = shortened;
      encoded = JSON.stringify(data);
    }
    if (encoded.length <= available) return prefix + encoded;
    let length = Math.max(20, Math.floor(available / 4));
    let preview = JSON.stringify({ truncated: true, preview: `${content.slice(0, length)}\n[Structured result shortened]\n${content.slice(-length)}` });
    while (preview.length > available && length > 10) {
      length = Math.floor(length / 2);
      preview = JSON.stringify({ truncated: true, preview: `${content.slice(0, length)}\n[Structured result shortened]\n${content.slice(-length)}` });
    }
    return prefix + preview;
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

/** Carry explicitly referenced earlier attachments into a later task turn. */
export function localTurnAttachments<T extends { id: string; name: string }>(current: T[], earlier: T[], request: string): T[] {
  const selected = current.slice(0, 3);
  const ids = new Set(selected.map(file => file.id));
  const names = new Set(selected.map(file => file.name.toLowerCase()));
  const text = request.toLowerCase();
  for (const file of [...earlier].reverse()) {
    if (selected.length >= 3) break;
    if (ids.has(file.id) || names.has(file.name.toLowerCase()) || !text.includes(file.name.toLowerCase())) continue;
    selected.push(file); ids.add(file.id); names.add(file.name.toLowerCase());
  }
  return selected;
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
export function prepareLocalInference(messages: OllamaMessage[], schemaCharacters = 0, imageCount = 0, optionalSystemContext: string[] = []) {
  let lastError: unknown;
  const candidateWithContext = (count: number) => {
    const candidate = structuredClone(messages);
    candidate[0].content += optionalSystemContext.slice(0, count).join('');
    if (count < optionalSystemContext.length) candidate[0].content += '\nEarlier execution summaries were shortened for this inference. Actual tool results remain in conversation history. Read a source again by its verified ID if a necessary fact is missing; do not infer it.';
    return candidate;
  };
  // These summaries duplicate stored tool evidence. Drop lower-priority
  // summaries before shortening the latest source or rejecting a valid task.
  for (let count = optionalSystemContext.length; count >= 0; count--) {
    for (const outputTokens of [4096, 3072, 2048]) {
      try {
        const candidate = candidateWithContext(count);
        compactSavedWriteCalls(candidate);
        compactToolLoop(candidate, localPromptCharacterBudget(outputTokens, schemaCharacters, imageCount), true);
        messages.splice(0, messages.length, ...candidate);
        return outputTokens;
      } catch (error) { lastError = error; }
    }
  }
  // A large newest source excerpt may itself exceed the remaining budget.
  // Keep its exact call/result group and JSON metadata, but shorten its text
  // explicitly so the model can request a smaller range using the same ID.
  for (let count = optionalSystemContext.length; count >= 0; count--) {
    try {
      const candidate = candidateWithContext(count);
      compactSavedWriteCalls(candidate);
      compactFailedWriteCalls(candidate);
      for (const message of candidate) {
        if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
        message.content = boundedContent(message.content, 600);
        if (message.thinking) message.thinking = boundedContent(message.thinking, 600);
      }
      compactToolLoop(candidate, localPromptCharacterBudget(2048, schemaCharacters, imageCount));
      messages.splice(0, messages.length, ...candidate);
      return 2048;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

/** Last-resort inference compaction; the stored failed call stays untouched. */
function compactFailedWriteCalls(messages: OllamaMessage[]) {
  for (let index = 0; index < messages.length; index++) {
    const calls = messages[index].tool_calls;
    if (!calls?.length) continue;
    const results: OllamaMessage[] = [];
    for (let next = index + 1; messages[next]?.role === "tool"; next++) results.push(messages[next]);
    for (const call of calls) {
      if (call.function.name !== "write_library_files") continue;
      const result = results.find(message => message.tool_name === "write_library_files");
      if (!result?.content.startsWith("Error:")) continue;
      const args = call.function.arguments;
      if (!args || typeof args !== "object" || Array.isArray(args)) continue;
      const shorten = (text: string) => text.length > 1200
        ? `${text.slice(0, 200)}\n[Failed-call text shortened for inference. This call did not save a file. Full arguments remain in conversation history; regenerate from verified sources or read an earlier saved revision.]\n${text.slice(-200)}`
        : text;
      const fields = args as Record<string, unknown>;
      if (typeof fields.files === "string") fields.files = shorten(fields.files);
      else if (Array.isArray(fields.files)) {
        for (const file of fields.files) {
          if (file && typeof file === "object" && typeof file.content === "string") file.content = shorten(file.content);
        }
      }
    }
  }
}

function compactSavedWriteCalls(messages: OllamaMessage[]) {
  for (let index = 0; index < messages.length; index++) {
    const calls = messages[index].tool_calls;
    if (!calls?.length) continue;
    const results = [];
    for (let next = index + 1; messages[next]?.role === "tool"; next++) results.push(messages[next]);
    for (const call of calls) {
      if (call.function.name !== "write_library_files") continue;
      const result = results.find(message => message.tool_name === "write_library_files");
      if (!result || result.content.startsWith("Error:")) continue;
      try {
        const data = JSON.parse(result.content);
        if (!data.artifacts?.length || !data.artifacts.every((file: { itemId?: string }) => file.itemId)) continue;
        const args = call.function.arguments;
        if (!args || typeof args !== "object" || Array.isArray(args)) continue;
        const files = (args as Record<string, unknown>).files;
        if (!Array.isArray(files)) continue;
        for (const file of files) {
          if (typeof file.content === "string" && file.content.length > 600) {
            file.content = `${file.content.slice(0, 200)}\n[Saved file content omitted from history. Read the actual file with read_library_item using its itemId from the tool result.]\n${file.content.slice(-200)}`;
          }
        }
      } catch { /* Failed or incomplete publication is retained unchanged. */ }
    }
  }
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
