import type { LocalMessage } from "@agent-commons/desktop-contract";
import type { OllamaMessage } from "./ollama-stream";

export const LOCAL_CONTEXT_SIZE = 16_384;

export function toolResult(name: string, content: string): OllamaMessage {
  return { role: "tool", tool_name: name, content: boundedContent(content, 8_000) };
}

function boundedContent(content: string, limit: number) {
  if (content.length <= limit) return content;
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
    return [{ role: message.role, content: message.role === "user" ? message.content : boundedContent(message.content, 8_000) }];
  });
  const retained: OllamaMessage[][] = [];
  let characters = 0;
  for (const group of groups.reverse()) {
    const size = JSON.stringify(group).length;
    if (characters + size > 28_000 && retained.length) break;
    retained.unshift(group);
    characters += size;
  }
  // Always start at a user turn, never an orphaned assistant/tool exchange.
  while (retained.length > 1 && retained[0][0]?.role !== "user") retained.shift();
  return retained.flat();
}

export function compactToolLoop(messages: OllamaMessage[]) {
  // Keep system + current request, retaining recent exchanges atomically. A
  // bounded prompt prevents Ollama silently truncating the task after big logs.
  let lastUser = messages.length - 1;
  while (lastUser > 0 && messages[lastUser].role !== "user") lastUser--;
  if (lastUser < 1) lastUser = 1;
  while (JSON.stringify(messages).length > 32_000 && lastUser > 1) {
    let end = 2;
    while (end < lastUser && messages[end].role !== "user") end++;
    messages.splice(1, end - 1);
    lastUser -= end - 1;
  }
  while (JSON.stringify(messages).length > 32_000 && messages.length > lastUser + 4) {
    let end = lastUser + 2;
    while (messages[end]?.role === "tool") end++;
    messages.splice(lastUser + 1, end - lastUser - 1);
  }
  if (JSON.stringify(messages).length > 32_000) {
    throw new Error("This request exceeds the Local model context budget. Use a smaller message or fewer Knowledge excerpts, then continue this conversation. Tool results have been saved.");
  }
}
