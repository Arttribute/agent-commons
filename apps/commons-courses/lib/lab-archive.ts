import { randomUUID } from "crypto";
import path from "path";
import JSZip from "jszip";
import type { LabWorkspaceAudience } from "@/types/lab-workspace";

const maxFiles = 120;
const maxExpandedSize = 100 * 1024 * 1024;
const maxFileSize = 25 * 1024 * 1024;
const maxPreviewSize = 250 * 1024;

export type ParsedLabFile = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  audience: LabWorkspaceAudience;
  purpose?: string;
  editable: boolean;
  preview?: string;
  bytes: Buffer;
};

export async function parseLabArchive(bytes: Buffer) {
  const archive = await JSZip.loadAsync(bytes, {
    checkCRC32: true,
    createFolders: false,
  });
  const entries = Object.values(archive.files).filter(
    (entry) => !entry.dir && !isJunk(entry.name),
  );
  if (!entries.length)
    throw new Error("The ZIP file does not contain any files.");
  if (entries.length > maxFiles) {
    throw new Error(`A lab pack can contain at most ${maxFiles} files.`);
  }
  const declaredExpandedSize = entries.reduce(
    (total, entry) => total + declaredSize(entry),
    0,
  );
  if (declaredExpandedSize > maxExpandedSize) {
    throw new Error("The expanded lab pack is larger than 100 MB.");
  }

  const raw = await Promise.all(
    entries.map(async (entry) => {
      const normalized = normalizeArchivePath(entry.name);
      const data = Buffer.from(await entry.async("uint8array"));
      if (data.length > maxFileSize) {
        throw new Error(`${normalized} is larger than 25 MB.`);
      }
      return { path: normalized, bytes: data };
    }),
  );
  const expandedSize = raw.reduce(
    (total, item) => total + item.bytes.length,
    0,
  );
  if (expandedSize > maxExpandedSize) {
    throw new Error("The expanded lab pack is larger than 100 MB.");
  }

  const commonRoot = findCommonRoot(raw.map((item) => item.path));
  const stripped = raw.map((item) => ({
    ...item,
    path: commonRoot ? item.path.slice(commonRoot.length + 1) : item.path,
  }));
  const manifestEntry = stripped.find(
    (item) => item.path.toLowerCase() === "lab_asset_manifest.csv",
  );
  const manifest = manifestEntry
    ? parseManifest(manifestEntry.bytes.toString("utf8"))
    : new Map<string, { audience: LabWorkspaceAudience; purpose?: string }>();

  const files: ParsedLabFile[] = stripped.map((item) => {
    const metadata = manifest.get(item.path.toLowerCase());
    const audience =
      metadata?.audience ||
      (item.path.toLowerCase().startsWith("facilitator/")
        ? "facilitator"
        : "learner");
    const mimeType = mimeFor(item.path);
    const editable =
      isEditable(item.path, mimeType) && item.bytes.length <= maxPreviewSize;
    return {
      id: randomUUID(),
      path: item.path,
      name: path.posix.basename(item.path),
      mimeType,
      size: item.bytes.length,
      audience,
      purpose: metadata?.purpose,
      editable,
      preview: editable ? item.bytes.toString("utf8") : undefined,
      bytes: item.bytes,
    };
  });

  const learnerArchive = new JSZip();
  for (const file of files) {
    if (file.audience === "learner") learnerArchive.file(file.path, file.bytes);
  }
  const learnerPack = Buffer.from(
    await learnerArchive.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    }),
  );
  return { files, learnerPack };
}

function declaredSize(entry: JSZip.JSZipObject) {
  const internal = entry as JSZip.JSZipObject & {
    _data?: { uncompressedSize?: number };
  };
  return Number(internal._data?.uncompressedSize || 0);
}

export function normalizeArchivePath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe ZIP path: ${value}`);
  }
  return normalized;
}

function findCommonRoot(paths: string[]) {
  const roots = new Set(paths.map((item) => item.split("/")[0]));
  return roots.size === 1 && paths.every((item) => item.includes("/"))
    ? [...roots][0]
    : undefined;
}

function isJunk(name: string) {
  return (
    name.startsWith("__MACOSX/") ||
    /(^|\/)\.DS_Store$/i.test(name) ||
    /(^|\/)\._/.test(name)
  );
}

function parseManifest(value: string) {
  const rows = parseCsv(value);
  const headers = rows.shift()?.map((cell) => cell.trim().toLowerCase()) || [];
  const pathIndex = headers.indexOf("path");
  const audienceIndex = headers.indexOf("audience");
  const purposeIndex = headers.indexOf("purpose");
  const result = new Map<
    string,
    { audience: LabWorkspaceAudience; purpose?: string }
  >();
  if (pathIndex < 0) return result;
  for (const row of rows) {
    const entryPath = row[pathIndex]
      ?.trim()
      .replaceAll("\\", "/")
      .toLowerCase();
    if (!entryPath) continue;
    const audience =
      row[audienceIndex]?.trim().toLowerCase() === "facilitator"
        ? "facilitator"
        : "learner";
    result.set(entryPath, {
      audience,
      purpose: row[purposeIndex]?.trim() || undefined,
    });
  }
  return result;
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function isEditable(filePath: string, mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    /\.(md|markdown|json|ya?ml|js|jsx|ts|tsx|py|sql)$/i.test(filePath)
  );
}

function mimeFor(filePath: string) {
  const extension = path.posix.extname(filePath).toLowerCase();
  return (
    (
      {
        ".md": "text/markdown; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".yaml": "text/yaml; charset=utf-8",
        ".yml": "text/yaml; charset=utf-8",
        ".pdf": "application/pdf",
        ".docx":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".ts": "text/typescript; charset=utf-8",
        ".py": "text/x-python; charset=utf-8",
      } as Record<string, string>
    )[extension] || "application/octet-stream"
  );
}
