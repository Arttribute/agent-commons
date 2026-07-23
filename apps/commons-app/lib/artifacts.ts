export type ArtifactRef = {
  fileId: string;
  name?: string;
  mimeType?: string;
  kind?: string;
  sizeBytes?: number;
  status?: string;
  textPreview?: string | null;
};

export type ArtifactPreview = {
  itemId: string;
  name: string;
  description?: string | null;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  source: string;
  textPreview?: string | null;
  metadata?: Record<string, unknown>;
  content?: string;
  totalChars?: number;
  truncated?: boolean;
  artifacts?: Array<{
    artifactId: string;
    kind: string;
    mimeType: string;
    pageNumber?: number | null;
    width?: number | null;
    height?: number | null;
    url?: string;
  }>;
  download?: {
    itemId: string;
    name: string;
    mimeType: string;
    url: string;
    expiresInSeconds: number;
  };
  inline?: {
    itemId: string;
    name: string;
    mimeType: string;
    url: string;
    expiresInSeconds: number;
  };
  createdAt: string;
  updatedAt: string;
};

const extensions: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export function artifactLabel(
  artifact: Pick<ArtifactRef, "name" | "mimeType" | "kind">,
) {
  const byMime = artifact.mimeType ? extensions[artifact.mimeType] : undefined;
  if (byMime) return byMime;
  const extension = artifact.name?.split(".").pop();
  if (extension && extension.length <= 8 && extension !== artifact.name) {
    return extension.toUpperCase();
  }
  return (artifact.kind || "FILE").toUpperCase();
}

export function artifactKind(
  artifact: Pick<ArtifactRef, "name" | "mimeType" | "kind">,
) {
  if (artifact.kind) return artifact.kind;
  const mime = artifact.mimeType || "";
  const name = artifact.name || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/presentation|powerpoint/.test(mime) || /\.(pptx?|odp)$/i.test(name)) {
    return "presentation";
  }
  if (/spreadsheet|excel/.test(mime) || /\.(xlsx?|ods|csv)$/i.test(name)) {
    return "spreadsheet";
  }
  if (
    /wordprocessing|msword|opendocument\.text|rtf/.test(mime) ||
    /\.(docx?|odt|rtf)$/i.test(name)
  ) {
    return "document";
  }
  if (
    mime.startsWith("text/") ||
    /\.(md|txt|json|xml|html|css|tsx?|jsx?|py|sql|ya?ml)$/i.test(name)
  ) {
    return "text";
  }
  if (
    /zip|compressed|archive/.test(mime) ||
    /\.(zip|7z|rar|tar|gz)$/i.test(name)
  ) {
    return "archive";
  }
  return "other";
}

export function prettyBytes(bytes?: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function collectArtifactRefs(value: unknown): ArtifactRef[] {
  const found = new Map<string, ArtifactRef>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof node === "string") {
      try {
        visit(JSON.parse(node), depth + 1);
      } catch {
        // Tool output is often plain prose; it is not an artifact manifest.
      }
      return;
    }
    if (typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const fileId =
      typeof record.fileId === "string"
        ? record.fileId
        : typeof record.itemId === "string" &&
            (typeof record.mimeType === "string" ||
              typeof record.name === "string")
          ? record.itemId
          : undefined;
    if (fileId) {
      found.set(fileId, {
        fileId,
        name: typeof record.name === "string" ? record.name : undefined,
        mimeType:
          typeof record.mimeType === "string" ? record.mimeType : undefined,
        kind: typeof record.kind === "string" ? record.kind : undefined,
        sizeBytes:
          typeof record.sizeBytes === "number" ? record.sizeBytes : undefined,
        status: typeof record.status === "string" ? record.status : undefined,
        textPreview:
          typeof record.textPreview === "string" ? record.textPreview : null,
      });
    }
    Object.values(record).forEach((entry) => visit(entry, depth + 1));
  };
  visit(value, 0);
  return [...found.values()];
}
