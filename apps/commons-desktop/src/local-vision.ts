import { existsSync, readFileSync, statSync } from 'node:fs';
import type { LocalLibraryItem } from '@agent-commons/desktop-contract';
import type { OllamaMessage } from './ollama-stream';

export async function localImageContext(endpoint: string, model: string, items: LocalLibraryItem[], render?: (items: LocalLibraryItem[]) => Promise<{ images: string[]; note: string }>) {
  const images = items.filter((item) => /^image\/(png|jpeg|webp)$/i.test(item.mimeType)).slice(0, 4);
  const videoFrames = items.filter((item) => item.mimeType.startsWith('video/')).flatMap((item) =>
    (item.mediaAnalysis?.frames ?? []).map((frame) => ({ ...frame, id: item.id, name: item.name }))).slice(0, 4);
  if (!images.length && !videoFrames.length) return { images: [] as string[], note: items.some((item) => item.mimeType.startsWith('video/'))
    ? 'No decoded frames are available for the attached video. Read its transcript and ask about unclear visual steps; do not invent them.' : '' };
  const response = await fetch(`${endpoint}/api/show`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(5000) }).catch(() => null);
  const metadata = response?.ok ? await response.json().catch(() => null) as { capabilities?: unknown } | null : null;
  if (!Array.isArray(metadata?.capabilities) || !metadata.capabilities.includes('vision')) return { images: [] as string[], note: 'The selected local model cannot inspect image pixels. Use exact note selections and authorized Python inspection; do not invent visual details.' };
  const readable = images.filter((item) => existsSync(item.path) && statSync(item.path).size <= 10 * 1024 * 1024);
  const frames = videoFrames.filter((frame) => existsSync(frame.path) && statSync(frame.path).size <= 1024 * 1024).slice(0, 4 - readable.length);
  const rendered = render && readable.length ? await render(readable) : undefined;
  return { images: [...(rendered?.images ?? readable.map((item) => readFileSync(item.path).toString('base64'))), ...frames.map((frame) => readFileSync(frame.path).toString('base64'))].slice(0, 4),
    note: [rendered?.note ?? (readable.length
      ? `Images supplied to the vision model, in order: ${readable.map((item) => `${item.name} (Library fileId ${item.id})`).join('; ')}. Use exact annotation coordinates; do not guess another version.` : ''),
      frames.length ? `Then sampled video frames, in order: ${frames.map((frame) => `${frame.name} (Library fileId ${frame.id}) at ${frame.timestampMs} ms`).join('; ')}. Read the timestamped transcript. Do not invent actions between sampled frames.` : '',
      !readable.length && !frames.length ? 'Attached visual evidence could not be read. Do not invent visual details.' : ''].filter(Boolean).join('\n') };
}

/** Keep binary data outside text compaction; attach it to the captured user turn. */
export function withLocalImages(messages: OllamaMessage[], userContent: string, images: string[]): OllamaMessage[] {
  if (!images.length) return messages;
  let index = -1;
  for (let position = messages.length - 1; position >= 0; position--) {
    const message = messages[position];
    if (message.role === 'user' && (message.content === userContent || message.content.startsWith(`${userContent}\n\n`))) { index = position; break; }
  }
  return messages.map((message, position) => position === index ? { ...message, images } : message);
}

/** Image files explicitly read or generated through this turn’s scoped tools.
 * The caller resolves IDs in the active profile; document text and connector
 * URLs cannot become image paths. */
export class LocalToolImageContext {
  private pending: string[] = [];

  record(name: string, result: string) {
    if (!["read_library_item", "generate_image"].includes(name)) return;
    try {
      const data = JSON.parse(result);
      const id = name === "read_library_item" ? data.itemId : data.artifactId;
      if (typeof id === "string" && id.length <= 160) this.pending.push(id);
    } catch { /* Failed tools and ordinary text are not visual evidence. */ }
  }

  take(library: LocalLibraryItem[]): LocalLibraryItem[] {
    const ids = [...new Set(this.pending.splice(0))].slice(-4);
    return ids.flatMap(id => {
      const item = library.find(entry => entry.id === id);
      return item && /^image\/(png|jpeg|webp)$/i.test(item.mimeType) ? [item] : [];
    });
  }
}
