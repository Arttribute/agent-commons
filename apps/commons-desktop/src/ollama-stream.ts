export type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ function: { name: string; arguments: unknown } }>;
};

type OllamaChunk = {
  message?: Partial<OllamaMessage>;
  done?: boolean;
  error?: string;
};

export async function readOllamaChatResponse(
  response: Response,
  onContent?: (content: string) => void,
): Promise<OllamaMessage> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Local model failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Local model returned no response stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let completed = false;
  const calls: NonNullable<OllamaMessage["tool_calls"]> = [];

  const consume = (line: string) => {
    if (!line.trim()) return;
    let chunk: OllamaChunk;
    try {
      chunk = JSON.parse(line) as OllamaChunk;
    } catch {
      throw new Error("Local model returned an invalid response stream");
    }
    if (chunk.error) throw new Error(chunk.error);
    if (chunk.message?.content) {
      content += chunk.message.content;
      onContent?.(content);
    }
    if (chunk.message?.tool_calls) calls.push(...chunk.message.tool_calls);
    if (chunk.done) completed = true;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    consume(pending);
    if (!completed) throw new Error("Local model response ended before completion");
    return { role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) };
  } finally {
    reader.releaseLock();
  }
}
