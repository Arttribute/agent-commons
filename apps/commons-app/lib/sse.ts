/**
 * Parse a server-sent event stream from a fetch Response.
 * Yields parsed JSON objects from `data:` lines, stops on [DONE].
 */
export async function* parseEventStream<T = unknown>(res: Response): AsyncGenerator<T> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;
        try {
          const event = JSON.parse(raw) as T;
          yield event;
        } catch {
          // ignore malformed lines
        }
      }
    }
  }
}
