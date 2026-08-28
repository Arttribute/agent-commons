type DirectoryHandle = any;

const handles = new Map<string, DirectoryHandle>();

export function supportsBrowserFolders() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function hasConnectedFolder(spaceId: string) {
  return handles.has(spaceId);
}

export async function chooseMarkdownFolder() {
  if (!supportsBrowserFolders()) {
    throw new Error("Folder connections require a Chromium-based browser.");
  }
  const handle = await (window as any).showDirectoryPicker({
    mode: "readwrite",
  });
  return {
    handle,
    name: String(handle.name || "Markdown folder"),
    documents: await readMarkdownDirectory(handle),
  };
}

export function rememberMarkdownFolder(
  spaceId: string,
  handle: DirectoryHandle,
) {
  handles.set(spaceId, handle);
}

export async function reconnectMarkdownFolder(spaceId: string) {
  const selected = await chooseMarkdownFolder();
  handles.set(spaceId, selected.handle);
  return selected;
}

export async function writeConnectedNote(
  spaceId: string,
  path: string,
  content: string,
) {
  const root = handles.get(spaceId);
  if (!root) return false;
  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) return false;
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
  return true;
}

export async function removeConnectedNote(spaceId: string, path: string) {
  const root = handles.get(spaceId);
  if (!root) return false;
  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const fileName = segments.pop();
  if (!fileName) return false;
  let directory = root;
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment);
  }
  await directory.removeEntry(fileName);
  return true;
}

async function readMarkdownDirectory(
  directory: DirectoryHandle,
  prefix = "",
): Promise<Array<{ path: string; content: string; modifiedAt?: string }>> {
  const documents: Array<{
    path: string;
    content: string;
    modifiedAt?: string;
  }> = [];
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      documents.push(...(await readMarkdownDirectory(handle, path)));
    } else if (/\.md$/i.test(name)) {
      const file = await handle.getFile();
      if (file.size > 2_000_000) continue;
      documents.push({
        path,
        content: await file.text(),
        modifiedAt: file.lastModified
          ? new Date(file.lastModified).toISOString()
          : undefined,
      });
    }
    if (documents.length >= 1_000) break;
  }
  return documents;
}
