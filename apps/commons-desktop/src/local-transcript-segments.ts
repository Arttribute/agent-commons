export function speechSegments(chunks: Array<{ text?: string; timestamp?: [number | null, number | null] }> | undefined, durationMs: number, offsetMs = 0) {
  return (chunks ?? []).flatMap((chunk) => {
    const [start, end] = chunk.timestamp ?? [];
    const text = chunk.text?.trim();
    if (!text || typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start * 1000 >= durationMs) return [];
    if (end !== null && (typeof end !== 'number' || !Number.isFinite(end) || end < start)) return [];
    return [{ startMs: offsetMs + Math.round(start * 1000), endMs: offsetMs + Math.min(durationMs, end === null ? durationMs : Math.round(end * 1000)), text }];
  });
}
