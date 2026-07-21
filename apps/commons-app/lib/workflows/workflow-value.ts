/**
 * Workflow value envelope — the string-first, presentation-aware contract every
 * node output is normalized to before display.
 *
 * `text` is ALWAYS present (the canonical string). `kind` + `data`/`mime` let
 * the results interpreter render the value for what it actually is.
 *
 * Mirror of `apps/commons-api/src/tool/workflow-value.ts` — keep in sync. The
 * backend enriches persisted `nodeResults[*].value`; this module normalizes the
 * final output and any legacy runs that predate backend enrichment.
 */

export type WorkflowValueKind =
  | "text"
  | "markdown"
  | "number"
  | "boolean"
  | "json"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "link"
  | "email"
  | "calendar_event"
  | "tool_result";

export interface WorkflowValue {
  kind: WorkflowValueKind;
  text: string;
  data?: Record<string, any>;
  mime?: string;
  label?: string;
  meta?: Record<string, any>;
}

export interface OutputPresentation {
  kind?: WorkflowValueKind;
  textPath?: string;
  fieldMap?: Record<string, string>;
  label?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|m4v)(\?|#|$)/i;
const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s|>|```|\|)/;

function firstString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function truncate(value: string, max = 6000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function safeStringify(value: any): string {
  try {
    return truncate(JSON.stringify(value, null, 2));
  } catch {
    return String(value);
  }
}

function classifyString(value: string, label?: string): WorkflowValue {
  const trimmed = value.trim();

  if (trimmed.startsWith("data:")) {
    const sep = trimmed.indexOf(";") > -1 ? trimmed.indexOf(";") : trimmed.indexOf(",");
    const mime = trimmed.slice(5, sep) || "";
    const kind: WorkflowValueKind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("audio/")
        ? "audio"
        : mime.startsWith("video/")
          ? "video"
          : "file";
    return { kind, text: `[${kind}]`, data: { url: trimmed }, mime: mime || undefined, label };
  }

  if (/^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed)) {
    if (IMAGE_EXT.test(trimmed)) return { kind: "image", text: trimmed, data: { url: trimmed }, label };
    if (AUDIO_EXT.test(trimmed)) return { kind: "audio", text: trimmed, data: { url: trimmed }, label };
    if (VIDEO_EXT.test(trimmed)) return { kind: "video", text: trimmed, data: { url: trimmed }, label };
    return { kind: "link", text: trimmed, data: { url: trimmed }, label };
  }

  if (MARKDOWN_HINT.test(value) || value.length > 280) {
    return { kind: "markdown", text: value, label };
  }
  return { kind: "text", text: value, label };
}

function classifyObject(obj: Record<string, any>, label?: string): WorkflowValue {
  const wrapperKeys = new Set(["result", "success", "status", "ok", "message"]);
  if (obj.result !== undefined && Object.keys(obj).every((k) => wrapperKeys.has(k))) {
    return normalizeValue(obj.result, label);
  }

  const to = firstString(obj, ["to", "recipient", "recipients", "toEmail"]);
  const subject = firstString(obj, ["subject", "title"]);
  const emailBody = firstString(obj, ["body", "text", "html", "message", "content"]);
  if (to && (subject || emailBody)) {
    return {
      kind: "email",
      text: subject || emailBody || "Email",
      data: {
        to,
        from: firstString(obj, ["from", "sender", "fromEmail"]),
        cc: obj.cc,
        subject,
        body: emailBody,
        status: firstString(obj, ["status", "state"]),
      },
      label,
    };
  }

  const start = firstString(obj, ["start", "startTime", "start_time", "startDate", "when", "begin"]);
  const eventTitle = firstString(obj, ["summary", "title", "eventTitle", "name"]);
  if (start && eventTitle) {
    return {
      kind: "calendar_event",
      text: eventTitle,
      data: {
        title: eventTitle,
        start,
        end: firstString(obj, ["end", "endTime", "end_time", "endDate", "finish"]),
        location: firstString(obj, ["location", "place"]),
        attendees: obj.attendees ?? obj.guests,
        link: firstString(obj, ["htmlLink", "link", "url", "eventUrl"]),
        description: firstString(obj, ["description", "notes"]),
      },
      label,
    };
  }

  const imageUrl = firstString(obj, ["imageUrl", "image_url", "image", "thumbnailUrl"]);
  if (imageUrl) return { kind: "image", text: imageUrl, data: { url: imageUrl, ...obj }, label };
  const audioUrl = firstString(obj, ["audioUrl", "audio_url", "audio", "speechUrl"]);
  if (audioUrl) return { kind: "audio", text: audioUrl, data: { url: audioUrl, ...obj }, label };
  const videoUrl = firstString(obj, ["videoUrl", "video_url", "video"]);
  if (videoUrl) return { kind: "video", text: videoUrl, data: { url: videoUrl, ...obj }, label };

  const fileUrl = firstString(obj, ["fileUrl", "downloadUrl", "url", "href"]);
  const fileName = firstString(obj, ["filename", "fileName", "name"]);
  if (fileUrl && (fileName || obj.mimeType || obj.size)) {
    return {
      kind: "file",
      text: fileName || fileUrl,
      data: { url: fileUrl, name: fileName, mime: obj.mimeType, size: obj.size },
      mime: firstString(obj, ["mimeType", "mime"]),
      label,
    };
  }
  if (fileUrl && /^https?:\/\//i.test(fileUrl)) {
    return { kind: "link", text: fileUrl, data: { url: fileUrl }, label };
  }

  if ("success" in obj || "status" in obj || "ok" in obj || "error" in obj) {
    return {
      kind: "tool_result",
      text: firstString(obj, ["message", "status", "summary"]) || safeStringify(obj),
      data: obj,
      label,
    };
  }

  return { kind: "json", text: safeStringify(obj), data: obj, label };
}

export function normalizeValue(raw: any, label?: string): WorkflowValue {
  if (raw === null || raw === undefined) return { kind: "text", text: "", label };
  if (typeof raw === "string") return classifyString(raw, label);
  if (typeof raw === "number") return { kind: "number", text: String(raw), label };
  if (typeof raw === "boolean") return { kind: "boolean", text: String(raw), label };
  if (Array.isArray(raw)) return { kind: "json", text: safeStringify(raw), data: { items: raw }, label };
  if (typeof raw === "object") return classifyObject(raw, label);
  return { kind: "text", text: String(raw), label };
}

/**
 * Coerce whatever a run gives us (already-normalized envelopes from the backend,
 * or a raw value from a legacy run / final output) into envelopes to render.
 */
export function toWorkflowValues(input: unknown, label?: string): WorkflowValue[] {
  if (input === undefined || input === null) return [];
  if (isEnvelopeArray(input)) return input;
  if (isEnvelope(input)) return [input];
  return [normalizeValue(input, label)];
}

function isEnvelope(value: any): value is WorkflowValue {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.kind === "string" &&
    typeof value.text === "string"
  );
}

function isEnvelopeArray(value: any): value is WorkflowValue[] {
  return Array.isArray(value) && value.length > 0 && value.every(isEnvelope);
}
