/**
 * Workflow value envelope — the string-first, presentation-aware contract that
 * every node output is normalized to before it is persisted or displayed.
 *
 * `text` is ALWAYS present: it is the canonical string the rest of the system
 * reads, wires by name, and feeds to agents/LLMs (they never receive raw
 * base64 blobs). `kind` + `data`/`mime` let the results interpreter render the
 * value for what it actually is — an image, audio, a sent email, a calendar
 * event, generic tool output, etc.
 *
 * This module is intentionally pure (no Nest/DI) so it can be unit-tested and
 * mirrored on the frontend. Keep it structurally in sync with
 * `apps/commons-app/lib/workflows/workflow-value.ts`.
 */

export type WorkflowValueKind =
  | 'text'
  | 'markdown'
  | 'number'
  | 'boolean'
  | 'json'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'link'
  | 'email'
  | 'calendar_event'
  | 'tool_result';

export interface WorkflowValue {
  kind: WorkflowValueKind;
  /** Canonical string representation — always present. */
  text: string;
  /** Structured payload when kind !== text (url, mime, fields, …). */
  data?: Record<string, any>;
  mime?: string;
  /** Human label for the value (usually the port/node name). */
  label?: string;
  /** Provenance / render hints (source tool or agent, etc.). */
  meta?: Record<string, any>;
}

/**
 * Optional descriptor a tool (or node) can declare to tell the normalizer and
 * the results interpreter how its output should be presented. Lives on
 * `tool.outputSchema.presentation` or `node.config.outputPresentation`.
 */
export interface OutputPresentation {
  kind?: WorkflowValueKind;
  /** Dot-path to the value that should become the primary text. */
  textPath?: string;
  /** Map of envelope data fields <- source dot-paths. */
  fieldMap?: Record<string, string>;
  label?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|m4v)(\?|#|$)/i;
const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s|>|```|\|)/;

function getPath(obj: any, path?: string): any {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function firstString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function truncate(value: string, max = 4000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function safeStringify(value: any): string {
  try {
    return truncate(JSON.stringify(value, null, 2));
  } catch {
    return String(value);
  }
}

/** Classify a bare string into an envelope. */
function classifyString(value: string, label?: string): WorkflowValue {
  const trimmed = value.trim();

  // Data URIs — keep the payload in data.url, never in text (blob hygiene).
  if (trimmed.startsWith('data:')) {
    const mime = trimmed.slice(5, trimmed.indexOf(';') > -1 ? trimmed.indexOf(';') : trimmed.indexOf(',')) || '';
    const kind: WorkflowValueKind = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('audio/')
        ? 'audio'
        : mime.startsWith('video/')
          ? 'video'
          : 'file';
    return {
      kind,
      text: `[${kind}]`,
      data: { url: trimmed },
      mime: mime || undefined,
      label,
    };
  }

  // URLs
  if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
    if (IMAGE_EXT.test(trimmed))
      return { kind: 'image', text: trimmed, data: { url: trimmed }, label };
    if (AUDIO_EXT.test(trimmed))
      return { kind: 'audio', text: trimmed, data: { url: trimmed }, label };
    if (VIDEO_EXT.test(trimmed))
      return { kind: 'video', text: trimmed, data: { url: trimmed }, label };
    return { kind: 'link', text: trimmed, data: { url: trimmed }, label };
  }

  // Prose vs markdown
  if (MARKDOWN_HINT.test(value) || value.length > 280) {
    return { kind: 'markdown', text: value, label };
  }
  return { kind: 'text', text: value, label };
}

/** Classify an object into an envelope, detecting common tool-output shapes. */
function classifyObject(obj: Record<string, any>, label?: string): WorkflowValue {
  // Unwrap a thin { result: X } wrapper so we classify the real payload.
  const wrapperKeys = new Set(['result', 'success', 'status', 'ok', 'message']);
  if (
    obj.result !== undefined &&
    Object.keys(obj).every((k) => wrapperKeys.has(k))
  ) {
    return normalizeValue(obj.result, label);
  }

  // Email
  const to = firstString(obj, ['to', 'recipient', 'recipients', 'toEmail']);
  const subject = firstString(obj, ['subject', 'title']);
  const emailBody = firstString(obj, ['body', 'text', 'html', 'message', 'content']);
  if (to && (subject || emailBody)) {
    return {
      kind: 'email',
      text: subject || emailBody || 'Email',
      data: {
        to,
        from: firstString(obj, ['from', 'sender', 'fromEmail']),
        cc: obj.cc,
        subject,
        body: emailBody,
        status: firstString(obj, ['status', 'state']),
      },
      label,
    };
  }

  // Calendar event
  const start = firstString(obj, ['start', 'startTime', 'start_time', 'startDate', 'when', 'begin']);
  const eventTitle = firstString(obj, ['summary', 'title', 'eventTitle', 'name']);
  if (start && eventTitle) {
    return {
      kind: 'calendar_event',
      text: eventTitle,
      data: {
        title: eventTitle,
        start,
        end: firstString(obj, ['end', 'endTime', 'end_time', 'endDate', 'finish']),
        location: firstString(obj, ['location', 'place']),
        attendees: obj.attendees ?? obj.guests,
        link: firstString(obj, ['htmlLink', 'link', 'url', 'eventUrl']),
        description: firstString(obj, ['description', 'notes']),
      },
      label,
    };
  }

  // Media by URL field
  const imageUrl = firstString(obj, ['imageUrl', 'image_url', 'image', 'thumbnailUrl']);
  if (imageUrl)
    return { kind: 'image', text: imageUrl, data: { url: imageUrl, ...obj }, label };
  const audioUrl = firstString(obj, ['audioUrl', 'audio_url', 'audio', 'speechUrl']);
  if (audioUrl)
    return { kind: 'audio', text: audioUrl, data: { url: audioUrl, ...obj }, label };
  const videoUrl = firstString(obj, ['videoUrl', 'video_url', 'video']);
  if (videoUrl)
    return { kind: 'video', text: videoUrl, data: { url: videoUrl, ...obj }, label };

  // Downloadable file
  const fileUrl = firstString(obj, ['fileUrl', 'downloadUrl', 'url', 'href']);
  const fileName = firstString(obj, ['filename', 'fileName', 'name']);
  if (fileUrl && (fileName || obj.mimeType || obj.size)) {
    return {
      kind: 'file',
      text: fileName || fileUrl,
      data: { url: fileUrl, name: fileName, mime: obj.mimeType, size: obj.size },
      mime: firstString(obj, ['mimeType', 'mime']),
      label,
    };
  }
  if (fileUrl && /^https?:\/\//i.test(fileUrl)) {
    return { kind: 'link', text: fileUrl, data: { url: fileUrl }, label };
  }

  // Recognizable tool result (has an outcome flag)
  if ('success' in obj || 'status' in obj || 'ok' in obj || 'error' in obj) {
    return {
      kind: 'tool_result',
      text: firstString(obj, ['message', 'status', 'summary']) || safeStringify(obj),
      data: obj,
      label,
    };
  }

  return { kind: 'json', text: safeStringify(obj), data: obj, label };
}

/** Normalize any raw value into a single envelope. */
export function normalizeValue(raw: any, label?: string): WorkflowValue {
  if (raw === null || raw === undefined) return { kind: 'text', text: '', label };
  if (typeof raw === 'string') return classifyString(raw, label);
  if (typeof raw === 'number')
    return { kind: 'number', text: String(raw), label };
  if (typeof raw === 'boolean')
    return { kind: 'boolean', text: String(raw), label };
  if (Array.isArray(raw))
    return { kind: 'json', text: safeStringify(raw), data: { items: raw }, label };
  if (typeof raw === 'object') return classifyObject(raw, label);
  return { kind: 'text', text: String(raw), label };
}

/** Build an envelope from an explicit presentation hint. */
function presentWithHint(
  raw: any,
  hint: OutputPresentation,
  label?: string,
): WorkflowValue {
  const kind = hint.kind ?? 'json';
  const data: Record<string, any> = {};
  if (hint.fieldMap) {
    for (const [field, path] of Object.entries(hint.fieldMap)) {
      data[field] = getPath(raw, path);
    }
  }
  const textSource = hint.textPath ? getPath(raw, hint.textPath) : undefined;
  const text =
    typeof textSource === 'string'
      ? textSource
      : textSource != null
        ? String(textSource)
        : typeof raw === 'string'
          ? raw
          : safeStringify(raw);
  return {
    kind,
    text,
    data: Object.keys(data).length ? data : typeof raw === 'object' ? raw : undefined,
    label: hint.label ?? label,
  };
}

/**
 * Normalize a tool/agent/node output into one or more presentation envelopes.
 * Honors an explicit presentation hint first, then falls back to heuristics.
 */
export function normalizeToolOutput(
  raw: any,
  hint?: OutputPresentation,
  label?: string,
): WorkflowValue[] {
  if (raw === undefined || raw === null) return [];
  if (hint?.kind) return [presentWithHint(raw, hint, label)];
  return [normalizeValue(raw, label)];
}
