type DirectoryHandle = any;

const handles = new Map<string, DirectoryHandle>();
const DATABASE_NAME = "agent-commons-knowledge-folders";
const STORE_NAME = "handles";

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
  const folders: string[] = [];
  return {
    handle,
    name: String(handle.name || "Markdown folder"),
    documents: await readMarkdownDirectory(handle, "", folders),
    folders,
  };
}

export async function rememberMarkdownFolder(
  spaceId: string,
  handle: DirectoryHandle,
) {
  handles.set(spaceId, handle);
  try {
    const database = await openHandleDatabase();
    await databaseRequest(
      database
        .transaction(STORE_NAME, "readwrite")
        .objectStore(STORE_NAME)
        .put(handle, spaceId),
    );
    database.close();
  } catch {
    // The active in-memory handle still works when IndexedDB handle cloning is
    // unavailable (for example in a browser privacy mode).
  }
}

export async function restoreMarkdownFolder(spaceId: string) {
  if (handles.has(spaceId)) return true;
  try {
    const database = await openHandleDatabase();
    const handle = await databaseRequest<DirectoryHandle | undefined>(
      database.transaction(STORE_NAME).objectStore(STORE_NAME).get(spaceId),
    );
    database.close();
    if (!handle) return false;
    const permission = handle.queryPermission
      ? await handle.queryPermission({ mode: "readwrite" })
      : "granted";
    if (permission !== "granted") return false;
    handles.set(spaceId, handle);
    return true;
  } catch {
    return false;
  }
}

export async function reconnectMarkdownFolder(spaceId: string) {
  const selected = await chooseMarkdownFolder();
  await rememberMarkdownFolder(spaceId, selected.handle);
  return selected;
}

export async function createConnectedFolder(spaceId: string, path: string) {
  const root = handles.get(spaceId);
  if (!root) return false;
  let directory = root;
  for (const segment of segments(path)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  return true;
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

export async function moveConnectedEntry(
  spaceId: string,
  fromPath: string,
  toPath: string,
  kind: "file" | "folder",
) {
  const root = handles.get(spaceId);
  if (!root) return false;
  if (kind === "file") {
    const source = await getFile(root, fromPath);
    await writeConnectedBlob(root, toPath, source);
    await removePath(root, fromPath, false);
    return true;
  }
  const source = await getDirectory(root, fromPath);
  await copyDirectory(source, root, toPath);
  await removePath(root, fromPath, true);
  return true;
}

export async function removeConnectedFolder(spaceId: string, path: string) {
  const root = handles.get(spaceId);
  if (!root) return false;
  await removePath(root, path, true);
  return true;
}

async function readMarkdownDirectory(
  directory: DirectoryHandle,
  prefix = "",
  folders: string[] = [],
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
      folders.push(path);
      documents.push(...(await readMarkdownDirectory(handle, path, folders)));
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

function segments(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}

async function getDirectory(root: DirectoryHandle, path: string) {
  let directory = root;
  for (const segment of segments(path)) {
    directory = await directory.getDirectoryHandle(segment);
  }
  return directory;
}

async function getFile(root: DirectoryHandle, path: string) {
  const parts = segments(path);
  const fileName = parts.pop();
  if (!fileName) throw new Error("File path is required");
  const directory = await getDirectory(root, parts.join("/"));
  return (await directory.getFileHandle(fileName)).getFile();
}

async function writeConnectedBlob(
  root: DirectoryHandle,
  path: string,
  blob: Blob,
) {
  const parts = segments(path);
  const fileName = parts.pop();
  if (!fileName) throw new Error("File path is required");
  let directory = root;
  for (const segment of parts) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function copyDirectory(
  source: DirectoryHandle,
  root: DirectoryHandle,
  targetPath: string,
) {
  const target = await createDirectoryHandle(root, targetPath);
  for await (const [name, handle] of source.entries()) {
    if (handle.kind === "directory") {
      await copyDirectory(handle, target, name);
    } else {
      await writeConnectedBlob(target, name, await handle.getFile());
    }
  }
}

async function createDirectoryHandle(root: DirectoryHandle, path: string) {
  let directory = root;
  for (const segment of segments(path)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  return directory;
}

async function removePath(
  root: DirectoryHandle,
  path: string,
  recursive: boolean,
) {
  const parts = segments(path);
  const name = parts.pop();
  if (!name) throw new Error("Path is required");
  const parent = await getDirectory(root, parts.join("/"));
  await parent.removeEntry(name, { recursive });
}

function openHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function databaseRequest<T = IDBValidKey>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
