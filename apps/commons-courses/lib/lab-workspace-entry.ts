import type { LabWorkspaceFileRecord } from "@/types/lab-workspace";

export type LabWorkspaceEntry = {
  folderPath: string;
  file?: LabWorkspaceFileRecord;
};

export function resolveLabWorkspaceEntry(
  files: LabWorkspaceFileRecord[],
  requestedPath?: string,
): LabWorkspaceEntry {
  const target = normalize(requestedPath);
  if (!target) return { folderPath: "" };

  const file = files.find((candidate) => normalize(candidate.path) === target);
  if (file) return { folderPath: parentPath(file.path), file };

  const folders = new Map<string, string>();
  for (const candidate of files) {
    const segments = candidate.path.split("/");
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) {
      const path = segments.slice(0, index).join("/");
      folders.set(normalize(path), path);
    }
  }

  let candidate = target;
  while (candidate) {
    const folder = folders.get(candidate);
    if (folder) return { folderPath: folder };
    candidate = candidate.split("/").slice(0, -1).join("/");
  }
  return { folderPath: "" };
}

export function labWorkspaceFolderPaths(files: LabWorkspaceFileRecord[]) {
  const folders = new Set<string>();
  for (const file of files.filter(
    (candidate) => candidate.audience === "learner",
  )) {
    const segments = file.path.split("/");
    segments.pop();
    for (let index = 1; index <= segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
  }
  return [...folders].sort(naturalCompare);
}

function normalize(value?: string) {
  return (value || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function parentPath(value: string) {
  return value.split("/").slice(0, -1).join("/");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
