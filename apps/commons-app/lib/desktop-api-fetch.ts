/** Uses the same Commons API shapes in both modes, with Local requests handled
 * by the desktop process and its on-disk workspace. */
let observedDesktopMode: "cloud" | "private-local" | null = null;
let networkFetch: typeof fetch | null = null;

export function setDesktopApiMode(mode: "cloud" | "private-local") {
  observedDesktopMode = mode;
}

function originalFetch(): typeof fetch {
  return networkFetch ?? fetch;
}

function requestPath(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname + input.search;
  const url = new URL(input.url);
  return url.pathname + url.search;
}

/** Same-origin Commons API paths that the Local workspace answers. */
function isLocalApiPath(input: RequestInfo | URL) {
  try {
    const url = new URL(requestPath(input), window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
  } catch {
    return false;
  }
}

async function localApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const bridge = window.agentCommonsLocal;
  if (!bridge) throw new Error("The Local desktop workspace is unavailable.");
  const url = new URL(requestPath(input), window.location.origin);
  const path = url.pathname + url.search;
  if (!path.startsWith("/api/")) throw new Error("Local requests must use Commons API paths.");
  const method = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
  let body: unknown;
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { body = undefined; }
  } else if (init?.body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    const files: Array<{ name: string; mimeType: string; bytes: Uint8Array }> = [];
    for (const [key, value] of init.body.entries()) {
      if (value instanceof File) {
        if (value.size > 20_000_000) throw new Error("Local uploads are limited to 20 MB per file.");
        files.push({ name: value.name, mimeType: value.type, bytes: new Uint8Array(await value.arrayBuffer()) });
      } else fields[key] = value;
    }
    body = { ...fields, files };
  }
  const result = await bridge.apiRequest({ path, method, body });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function desktopApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (observedDesktopMode === null && typeof window !== "undefined" && window.agentCommonsDesktop) {
    observedDesktopMode = (await window.agentCommonsDesktop.getInfo()).mode;
  }
  if (!isLocalDesktopMode()) return originalFetch()(input, init);
  return localApiRequest(input, init);
}

/**
 * In the desktop app, routes same-origin Commons API calls through the Local
 * workspace while Private Local is active, so every view reads and writes
 * this computer's data instead of reaching for Commons Cloud.
 */
export function installLocalApiFetch() {
  if (typeof window === "undefined" || networkFetch || !window.agentCommonsLocal) return;
  networkFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (isLocalDesktopMode() && isLocalApiPath(input)) return localApiRequest(input, init);
    return networkFetch!(input, init);
  }) as typeof fetch;
}

export function isLocalDesktopMode() {
  if (observedDesktopMode !== null) return observedDesktopMode === "private-local";
  return typeof document !== "undefined" &&
    document.cookie.split(";").some((part) => part.trim() === "commons-desktop-mode=private-local");
}
