const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 25_000_000;
const DEPLOYMENT_PATH = /^\/v1\/previews\/[^/]+\/deployments\/[0-9a-f-]{36}\/?/i;

type Fetcher = (url: string, init?: { signal?: AbortSignal; redirect?: "error" }) => Promise<Response>;

/** Relative asset references in HTML, CSS, and ES module source. */
export function assetReferences(text: string, contentType: string) {
  const references = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return;
    references.add(trimmed.split("#")[0].split("?")[0]);
  };
  if (contentType.includes("html")) {
    for (const match of text.matchAll(/\s(?:src|href)=["']([^"']+)["']/gi)) add(match[1]);
  }
  if (contentType.includes("css") || contentType.includes("html")) {
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
  }
  if (contentType.includes("javascript")) {
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) add(match[1]);
    for (const match of text.matchAll(/new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url/g)) add(match[1]);
  }
  return [...references].filter(Boolean);
}

/**
 * Downloads a published Commons app build from its immutable deployment URL.
 * Only files under that deployment on the same origin are fetched.
 */
export async function downloadPublishedApp(entryUrl: string, fetcher: Fetcher, signal?: AbortSignal) {
  const entry = new URL(entryUrl);
  if (entry.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(entry.hostname)) throw new Error("Published apps must use HTTPS.");
  const deployment = DEPLOYMENT_PATH.exec(entry.pathname)?.[0];
  if (!deployment) throw new Error("Only published app deployments can be kept on this computer.");
  const base = new URL(deployment.endsWith("/") ? deployment : `${deployment}/`, entry.origin);
  const queue = ["index.html"];
  const seen = new Set(queue);
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  let total = 0;
  while (queue.length && files.length < MAX_FILES) {
    const path = queue.shift()!;
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
    const response = await fetcher(url.toString(), { signal, redirect: "error" });
    if (!response.ok) {
      if (path === "index.html") throw new Error(`The app could not be downloaded (${response.status}).`);
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) throw new Error("Apps larger than 25 MB cannot be kept on this computer.");
    const relative = decodeURIComponent(url.pathname.slice(base.pathname.length)) || "index.html";
    files.push({ path: relative, bytes });
    const contentType = response.headers.get("content-type") ?? (relative.endsWith(".html") ? "text/html" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".js") ? "text/javascript" : "");
    if (!/html|css|javascript/.test(contentType)) continue;
    for (const reference of assetReferences(new TextDecoder().decode(bytes), contentType)) {
      const target = new URL(reference, url);
      if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) continue;
      const next = decodeURIComponent(target.pathname.slice(base.pathname.length));
      if (!next || seen.has(next) || next.includes("..")) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return files;
}
