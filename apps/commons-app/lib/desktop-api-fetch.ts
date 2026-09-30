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
        if (value.size > 25 * 1024 * 1024) throw new Error("Local uploads are limited to 25 MB per file.");
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
  if (!isLocalDesktopMode()) {
    if (requestPath(input).split("?")[0] === "/api/files/upload" && init?.body instanceof FormData) {
      return uploadCloudFiles(init.body);
    }
    return originalFetch()(input, init);
  }
  return localApiRequest(input, init);
}

async function uploadCloudFiles(form: FormData): Promise<Response> {
  const uploaded: unknown[] = [];
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  for (const file of files) {
    if (file.size < 1 || file.size > 25 * 1024 * 1024) {
      return Response.json({ message: `${file.name} must be 25 MB or smaller` }, { status: 413 });
    }
    const ticketResponse = await originalFetch()("/api/files/upload-ticket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, mimeType: file.type, size: file.size, agentId: form.get("agentId"), sessionId: form.get("sessionId"), storageProvider: form.get("storageProvider") }),
    });
    const ticket = await ticketResponse.json().catch(() => ({}));
    if (!ticketResponse.ok || !ticket?.data?.url) {
      return Response.json(ticket, { status: ticketResponse.status });
    }
    const body = new FormData();
    body.append("files", file);
    const response = await originalFetch()(ticket.data.url, { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return Response.json(result, { status: response.status });
    if (Array.isArray(result?.data)) uploaded.push(...result.data);
  }
  return Response.json({ data: uploaded });
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
