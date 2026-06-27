export function extractAssistantText(value: unknown): string {
  if (!value) return "The agent completed the run, but no text response was returned.";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(extractAssistantText).filter(Boolean).join("\n");
    return text || "The agent returned an empty response.";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["content", "message", "text", "output", "response", "final"]) {
      const text = extractAssistantText(record[key]);
      if (text && !text.startsWith("The agent completed")) return text;
    }
  }
  return "The agent completed the run. Check logs for details.";
}
