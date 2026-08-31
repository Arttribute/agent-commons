export function knowledgeFileName(path: string, includeExtension = false) {
  const name = path.replace(/\\/g, "/").split("/").pop() || "Untitled.md";
  return includeExtension ? name : name.replace(/\.md$/i, "");
}

export function knowledgeLinkTarget(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.md$/i, "");
}

export function normalizeKnowledgePathInput(path: string) {
  return path
    .trim()
    .replace(/\\\./g, ".")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}
