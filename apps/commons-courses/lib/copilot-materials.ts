import zlib from "node:zlib";

export type MaterialExtract = {
  name: string;
  type: string;
  size: number;
  text: string;
  imageDataUrl?: string;
};

export const defaultMaterialTextChars = 22000;

export async function extractMaterial(
  file: File,
  options: { maxTextChars?: number; includeImageData?: boolean } = {}
): Promise<MaterialExtract> {
  const maxTextChars = options.maxTextChars || defaultMaterialTextChars;
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type || guessMimeType(file.name);

  if (type.startsWith("image/")) {
    return {
      name: file.name,
      type,
      size: file.size,
      text: `Image uploaded: ${file.name}`,
      imageDataUrl:
        options.includeImageData === false
          ? undefined
          : `data:${type};base64,${buffer.toString("base64")}`,
    };
  }

  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const text = extractLoosePdfText(buffer, maxTextChars);
    return {
      name: file.name,
      type,
      size: file.size,
      text:
        text ||
        "PDF uploaded, but no extractable text was found. If this PDF is image-only, upload slide images as well for stronger AI drafting.",
    };
  }

  if (
    type.startsWith("text/") ||
    /\.(md|markdown|txt|csv|json)$/i.test(file.name)
  ) {
    return {
      name: file.name,
      type,
      size: file.size,
      text: buffer.toString("utf8").slice(0, maxTextChars),
    };
  }

  return {
    name: file.name,
    type,
    size: file.size,
    text: `Uploaded unsupported file type ${type}. Use text, PDF, or image files for best results.`,
  };
}

export function formatMaterialContext(
  materials: MaterialExtract[],
  maxChars = defaultMaterialTextChars
) {
  return materials
    .map(
      (item) =>
        `File: ${item.name}\nType: ${item.type}\nSize: ${formatBytes(item.size)}\n${item.text}`
    )
    .join("\n\n")
    .slice(0, maxChars);
}

export function materialAttachmentSummary(materials: MaterialExtract[]) {
  return materials.map((item) => ({
    name: item.name,
    type: item.type,
    size: item.size,
    textPreview: item.text.slice(0, 700),
  }));
}

function extractLoosePdfText(buffer: Buffer, maxTextChars: number) {
  const raw = buffer.toString("latin1");
  const chunks = [raw];
  let offset = 0;
  while (true) {
    const streamIndex = raw.indexOf("stream", offset);
    if (streamIndex === -1) break;
    const endIndex = raw.indexOf("endstream", streamIndex);
    if (endIndex === -1) break;
    const header = raw.slice(Math.max(0, streamIndex - 400), streamIndex);
    if (header.includes("FlateDecode")) {
      let start = streamIndex + "stream".length;
      if (raw[start] === "\r" && raw[start + 1] === "\n") start += 2;
      else if (raw[start] === "\n") start += 1;
      let end = endIndex;
      while (end > start && (raw[end - 1] === "\n" || raw[end - 1] === "\r")) end -= 1;
      try {
        chunks.push(zlib.inflateSync(buffer.subarray(start, end)).toString("utf8"));
      } catch {
        // Ignore compressed streams that are not text streams.
      }
    }
    offset = endIndex + "endstream".length;
  }

  const text = chunks
    .flatMap((chunk) => extractPdfStrings(chunk))
    .join("\n")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, maxTextChars);
}

function extractPdfStrings(value: string) {
  const matches = value.match(/\((?:\\.|[^\\)]){2,}\)/g) || [];
  return matches
    .map((item) =>
      item
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\t/g, " ")
        .replace(/\\([()\\])/g, "$1")
    )
    .filter((item) => /[A-Za-z]{3}/.test(item))
    .slice(0, 600);
}

export function guessMimeType(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.docx$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (/\.xlsx?$/i.test(name)) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (/\.(png|jpg|jpeg|webp)$/i.test(name)) return "image/*";
  if (/\.(md|markdown|txt|csv|json)$/i.test(name)) return "text/plain";
  return "application/octet-stream";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
