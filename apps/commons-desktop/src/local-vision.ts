import { existsSync, readFileSync, statSync } from 'node:fs';
import type { LocalLibraryItem } from '@agent-commons/desktop-contract';
import type { OllamaMessage } from './ollama-stream';

export async function localImageContext(endpoint: string, model: string, items: LocalLibraryItem[], render?: (items: LocalLibraryItem[]) => Promise<{ images: string[]; note: string }>) {
  const images = items.filter((item) => /^image\/(png|jpeg|webp)$/i.test(item.mimeType)).slice(0, 4);
  if (!images.length) return { images: [] as string[], note: '' };
  const response = await fetch(`${endpoint}/api/show`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(5000) }).catch(() => null);
  const metadata = response?.ok ? await response.json().catch(() => null) as { capabilities?: unknown } | null : null;
  if (!Array.isArray(metadata?.capabilities) || !metadata.capabilities.includes('vision')) return { images: [] as string[], note: 'The selected local model cannot inspect image pixels. Use exact note selections and authorized Python inspection; do not invent visual details.' };
  const readable = images.filter((item) => existsSync(item.path) && statSync(item.path).size <= 10 * 1024 * 1024);
  if (render && readable.length) return render(readable);
  return { images: readable.map((item) => readFileSync(item.path).toString('base64')), note: readable.length
    ? `Images supplied to the vision model, in order: ${readable.map((item) => `${item.name} (Library fileId ${item.id})`).join('; ')}. Use exact annotation coordinates; do not guess another version.` : 'Attached images exceed the local vision input size. Inspect them with run_python; do not invent visual details.' };
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
