/** Uses the same Commons API shapes in both modes, with Local requests handled
 * by the desktop process and its on-disk workspace. */
let observedDesktopMode: "cloud" | "private-local" | null = null;

export function setDesktopApiMode(mode: "cloud" | "private-local") {
  observedDesktopMode = mode;
}

export async function desktopApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (observedDesktopMode === null && typeof window !== "undefined" && window.agentCommonsDesktop) {
    observedDesktopMode = (await window.agentCommonsDesktop.getInfo()).mode;
  }
  const local = isLocalDesktopMode();
  if (!local) return fetch(input, init);
  const bridge = window.agentCommonsLocal;
  if (!bridge) throw new Error("The Local desktop workspace is unavailable.");
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : new URL(input.url).pathname + new URL(input.url).search;
  if (!path.startsWith("/api/")) throw new Error("Local requests must use Commons API paths.");
  let body: unknown;
  if (typeof init?.body === "string") body = JSON.parse(init.body);
  else if (init?.body instanceof FormData) {
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
  const result = await bridge.apiRequest({ path, method: init?.method ?? "GET", body });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
}

export function isLocalDesktopMode() {
  if (observedDesktopMode !== null) return observedDesktopMode === "private-local";
  return typeof document !== "undefined" &&
    document.cookie.split(";").some((part) => part.trim() === "commons-desktop-mode=private-local");
}
